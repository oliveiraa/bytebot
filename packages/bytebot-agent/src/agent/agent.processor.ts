import { TasksService } from '../tasks/tasks.service';
import { MessagesService } from '../messages/messages.service';
import { Injectable, Logger } from '@nestjs/common';
import { Role, TaskPriority, TaskStatus, TaskType } from '@prisma/client';
import { AnthropicService } from '../anthropic/anthropic.service';
import { OPUS_MODEL, SONNET_MODEL } from '../anthropic/anthropic.constants';
import {
  isScrollToolUseBlock,
  isWaitToolUseBlock,
  isScreenshotToolUseBlock,
  isCursorPositionToolUseBlock,
  isComputerToolUseContentBlock,
  isMoveMouseToolUseBlock,
  isTraceMouseToolUseBlock,
  isClickMouseToolUseBlock,
  isPressMouseToolUseBlock,
  isDragMouseToolUseBlock,
  isTypeKeysToolUseBlock,
  isTypeTextToolUseBlock,
  isPressKeysToolUseBlock,
  isSetTaskStatusToolUseBlock,
  isCreateTaskToolUseBlock,
} from '@bytebot/shared';

import {
  Button,
  ComputerToolUseContentBlock,
  Coordinates,
  MessageContentBlock,
  MessageContentType,
  Press,
  ToolResultContentBlock,
} from '@bytebot/shared';
import { ConfigService } from '@nestjs/config';
import { InputCaptureService } from './input-capture.service';
import { OnEvent } from '@nestjs/event-emitter';

@Injectable()
export class AgentProcessor {
  private readonly logger = new Logger(AgentProcessor.name);
  private currentTaskId: string | null = null;
  private isProcessing = false;
  private abortController: AbortController | null = null;

  constructor(
    private readonly tasksService: TasksService,
    private readonly messagesService: MessagesService,
    private readonly anthropicService: AnthropicService,
    private readonly configService: ConfigService,
    private readonly inputCaptureService: InputCaptureService,
  ) {
    this.logger.log('AgentProcessor initialized');
  }

  /**
   * Check if the processor is currently processing a task
   */
  isRunning(): boolean {
    return this.isProcessing;
  }

  /**
   * Get the current task ID being processed
   */
  getCurrentTaskId(): string | null {
    return this.currentTaskId;
  }

  @OnEvent('task.takeover')
  handleTaskTakeover({ taskId }: { taskId: string }) {
    if (this.currentTaskId === taskId && this.isProcessing) {
      this.logger.log(`Task takeover event received for task ID: ${taskId}`);

      // Signal any in-flight async operations to abort
      this.abortController?.abort();

      this.inputCaptureService.start(taskId);
    }
  }

  @OnEvent('task.resume')
  handleTaskResume({ taskId }: { taskId: string }) {
    if (this.currentTaskId === taskId && this.isProcessing) {
      this.logger.log(`Task resume event received for task ID: ${taskId}`);
      this.abortController = new AbortController();

      void this.runIteration(taskId);
    }
  }

  processTask(taskId: string) {
    this.logger.log(`Starting processing for task ID: ${taskId}`);

    if (this.isProcessing) {
      this.logger.warn('AgentProcessor is already processing another task');
      return;
    }

    this.isProcessing = true;
    this.currentTaskId = taskId;
    this.abortController = new AbortController();

    // Kick off the first iteration without blocking the caller
    void this.runIteration(taskId);
  }

  /**
   * Runs a single iteration of task processing and schedules the next
   * iteration via setImmediate while the task remains RUNNING.
   */
  private async runIteration(taskId: string): Promise<void> {
    if (!this.isProcessing) {
      return;
    }

    try {
      const task = await this.tasksService.findById(taskId);

      if (task.status !== TaskStatus.RUNNING) {
        this.logger.log(
          `Task processing completed for task ID: ${taskId} with status: ${task.status}`,
        );
        this.isProcessing = false;
        this.currentTaskId = null;
        return;
      }

      this.logger.log(`Processing iteration for task ID: ${taskId}`);

      // Refresh abort controller for this iteration to avoid accumulating
      // "abort" listeners on a single AbortSignal across iterations.
      this.abortController = new AbortController();

      const messages = await this.messagesService.findEvery(taskId);
      this.logger.debug(
        `Sending ${messages.length} messages to LLM for processing`,
      );

      const modelId =
        (task as any).model && (task as any).model === 'CLAUDE_OPUS_4'
          ? OPUS_MODEL
          : SONNET_MODEL;

      const messageContentBlocks: MessageContentBlock[] =
        await this.anthropicService.sendMessage(
          messages,
          modelId,
          this.abortController.signal,
        );

      this.logger.debug(
        `Received ${messageContentBlocks.length} content blocks from LLM`,
      );

      if (messageContentBlocks.length === 0) {
        this.logger.warn(
          `Task ID: ${taskId} received no content blocks from LLM, marking as failed`,
        );
        await this.tasksService.update(taskId, {
          status: TaskStatus.FAILED,
        });
        this.isProcessing = false;
        this.currentTaskId = null;
        return;
      }

      await this.messagesService.create({
        content: messageContentBlocks,
        role: Role.ASSISTANT,
        taskId,
      });

      const generatedToolResults: ToolResultContentBlock[] = [];

      for (const block of messageContentBlocks) {
        if (isComputerToolUseContentBlock(block)) {
          const result = await this.handleComputerToolUse(block);
          generatedToolResults.push(result);
        }

        if (isCreateTaskToolUseBlock(block)) {
          const type = block.input.type?.toUpperCase() as TaskType;
          const priority = block.input.priority?.toUpperCase() as TaskPriority;

          await this.tasksService.create({
            description: block.input.description,
            type,
            createdBy: Role.ASSISTANT,
            ...(block.input.scheduledFor && {
              scheduledFor: new Date(block.input.scheduledFor),
            }),
            priority,
          });

          generatedToolResults.push({
            type: MessageContentType.ToolResult,
            tool_use_id: block.id,
            content: [
              {
                type: MessageContentType.Text,
                text: 'The task has been created',
              },
            ],
          });
        }

        if (isSetTaskStatusToolUseBlock(block)) {
          switch (block.input.status) {
            case 'completed':
              await this.tasksService.update(taskId, {
                status: TaskStatus.COMPLETED,
                completedAt: new Date(),
              });
              break;
            case 'failed':
              await this.tasksService.update(taskId, {
                status: TaskStatus.FAILED,
              });
              break;
            case 'needs_help':
              generatedToolResults.push({
                type: MessageContentType.ToolResult,
                tool_use_id: block.id,
                content: [
                  {
                    type: MessageContentType.Text,
                    text: 'The task has been set to needs help',
                  },
                ],
              });
              await this.tasksService.update(taskId, {
                status: TaskStatus.NEEDS_HELP,
              });
              break;
          }
        }
      }

      if (generatedToolResults.length > 0) {
        await this.messagesService.create({
          content: generatedToolResults,
          role: Role.USER,
          taskId,
        });
      }

      // Schedule the next iteration without blocking
      if (this.isProcessing) {
        setImmediate(() => this.runIteration(taskId));
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        this.logger.warn(`Processing aborted for task ID: ${taskId}`);
      } else {
        this.logger.error(
          `Error during task processing iteration for task ID: ${taskId} - ${error.message}`,
          error.stack,
        );
        await this.tasksService.update(taskId, {
          status: TaskStatus.FAILED,
        });
        this.isProcessing = false;
        this.currentTaskId = null;
      }
    }
  }

  async stopProcessing(): Promise<void> {
    if (!this.isProcessing) {
      return;
    }

    this.logger.log(`Stopping execution of task ${this.currentTaskId}`);

    // Signal any in-flight async operations to abort
    this.abortController?.abort();

    if (this.currentTaskId) {
      await this.tasksService.update(this.currentTaskId, {
        status: TaskStatus.CANCELLED,
      });
    }

    this.isProcessing = false;
    this.currentTaskId = null;
  }

  private async handleComputerToolUse(
    block: ComputerToolUseContentBlock,
  ): Promise<ToolResultContentBlock> {
    this.logger.debug(
      `Handling computer tool use: ${block.name}, tool_use_id: ${block.id}`,
    );

    if (isScreenshotToolUseBlock(block)) {
      this.logger.debug('Processing screenshot request');
      try {
        this.logger.debug('Taking screenshot');
        const image = await this.screenshot();
        this.logger.debug('Screenshot captured successfully');

        return {
          type: MessageContentType.ToolResult,
          tool_use_id: block.id,
          content: [
            {
              type: MessageContentType.Image,
              source: {
                data: image,
                media_type: 'image/png',
                type: 'base64',
              },
            },
          ],
        };
      } catch (error) {
        this.logger.error(`Screenshot failed: ${error.message}`, error.stack);
        return {
          type: MessageContentType.ToolResult,
          tool_use_id: block.id,
          content: [
            {
              type: MessageContentType.Text,
              text: 'ERROR: Failed to take screenshot',
            },
          ],
          is_error: true,
        };
      }
    }

    if (isCursorPositionToolUseBlock(block)) {
      this.logger.debug('Processing cursor position request');
      try {
        this.logger.debug('Getting cursor position');
        const position = await this.cursorPosition();
        this.logger.debug(
          `Cursor position obtained: ${position.x}, ${position.y}`,
        );

        return {
          type: MessageContentType.ToolResult,
          tool_use_id: block.id,
          content: [
            {
              type: MessageContentType.Text,
              text: `Cursor position: ${position.x}, ${position.y}`,
            },
          ],
        };
      } catch (error) {
        this.logger.error(
          `Getting cursor position failed: ${error.message}`,
          error.stack,
        );
        return {
          type: MessageContentType.ToolResult,
          tool_use_id: block.id,
          content: [
            {
              type: MessageContentType.Text,
              text: 'ERROR: Failed to get cursor position',
            },
          ],
          is_error: true,
        };
      }
    }

    try {
      if (isMoveMouseToolUseBlock(block)) {
        await this.moveMouse(block.input);
      }
      if (isTraceMouseToolUseBlock(block)) {
        await this.traceMouse(block.input);
      }
      if (isClickMouseToolUseBlock(block)) {
        await this.clickMouse(block.input);
      }
      if (isPressMouseToolUseBlock(block)) {
        await this.pressMouse(block.input);
      }
      if (isDragMouseToolUseBlock(block)) {
        await this.dragMouse(block.input);
      }
      if (isScrollToolUseBlock(block)) {
        await this.scroll(block.input);
      }
      if (isTypeKeysToolUseBlock(block)) {
        await this.typeKeys(block.input);
      }
      if (isPressKeysToolUseBlock(block)) {
        await this.pressKeys(block.input);
      }
      if (isTypeTextToolUseBlock(block)) {
        await this.typeText(block.input);
      }
      if (isWaitToolUseBlock(block)) {
        await this.wait(block.input);
      }
      this.logger.debug(
        `Tool execution successful for tool_use_id: ${block.id}`,
      );
      return {
        type: MessageContentType.ToolResult,
        tool_use_id: block.id,
        content: [
          {
            type: MessageContentType.Text,
            text: 'Tool executed successfully',
          },
        ],
      };
    } catch (error) {
      this.logger.error(
        `Error executing ${block.input.action} tool: ${error.message}`,
        error.stack,
      );
      return {
        type: MessageContentType.ToolResult,
        tool_use_id: block.id,
        content: [
          {
            type: MessageContentType.Text,
            text: `Error executing ${block.input.action} tool: ${error.message}`,
          },
        ],
        is_error: true,
      };
    }
  }

  private async moveMouse(input: { coordinates: Coordinates }): Promise<void> {
    const { coordinates } = input;
    console.log(
      `Moving mouse to coordinates: [${coordinates.x}, ${coordinates.y}]`,
    );

    try {
      await fetch(
        `${this.configService.get<string>('BYTEBOT_DESKTOP_BASE_URL')}/computer-use`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'move_mouse',
            coordinates,
          }),
        },
      );
    } catch (error) {
      console.error('Error in move_mouse action:', error);
      throw error;
    }
  }

  private async traceMouse(input: {
    path: Coordinates[];
    holdKeys?: string[];
  }): Promise<void> {
    const { path, holdKeys } = input;
    console.log(
      `Tracing mouse to path: ${path} ${holdKeys ? `with holdKeys: ${holdKeys}` : ''}`,
    );

    try {
      await fetch(
        `${this.configService.get<string>('BYTEBOT_DESKTOP_BASE_URL')}/computer-use`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'trace_mouse',
            path,
            holdKeys,
          }),
        },
      );
    } catch (error) {
      console.error('Error in trace_mouse action:', error);
      throw error;
    }
  }

  private async clickMouse(input: {
    coordinates?: Coordinates;
    button: Button;
    holdKeys?: string[];
    numClicks: number;
  }): Promise<void> {
    const { coordinates, button, holdKeys, numClicks } = input;
    console.log(
      `Clicking mouse ${button} ${numClicks} times ${coordinates ? `at coordinates: [${coordinates.x}, ${coordinates.y}] ` : ''} ${holdKeys ? `with holdKeys: ${holdKeys}` : ''}`,
    );

    try {
      await fetch(
        `${this.configService.get<string>('BYTEBOT_DESKTOP_BASE_URL')}/computer-use`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'click_mouse',
            coordinates,
            button,
            holdKeys,
            numClicks,
          }),
        },
      );
    } catch (error) {
      console.error('Error in click_mouse action:', error);
      throw error;
    }
  }

  private async pressMouse(input: {
    coordinates?: Coordinates;
    button: Button;
    press: Press;
  }): Promise<void> {
    const { coordinates, button, press } = input;
    console.log(
      `Pressing mouse ${button} ${press} ${coordinates ? `at coordinates: [${coordinates.x}, ${coordinates.y}]` : ''}`,
    );

    try {
      await fetch(
        `${this.configService.get<string>('BYTEBOT_DESKTOP_BASE_URL')}/computer-use`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'press_mouse',
            coordinates,
            button,
            press,
          }),
        },
      );
    } catch (error) {
      console.error('Error in press_mouse action:', error);
      throw error;
    }
  }

  private async dragMouse(input: {
    path: Coordinates[];
    button: Button;
    holdKeys?: string[];
  }): Promise<void> {
    const { path, button, holdKeys } = input;
    console.log(
      `Dragging mouse to path: ${path} ${holdKeys ? `with holdKeys: ${holdKeys}` : ''}`,
    );

    try {
      await fetch(
        `${this.configService.get<string>('BYTEBOT_DESKTOP_BASE_URL')}/computer-use`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'drag_mouse',
            path,
            button,
            holdKeys,
          }),
        },
      );
    } catch (error) {
      console.error('Error in drag_mouse action:', error);
      throw error;
    }
  }

  private async scroll(input: {
    coordinates?: Coordinates;
    direction: 'up' | 'down' | 'left' | 'right';
    numScrolls: number;
    holdKeys?: string[];
  }): Promise<void> {
    const { coordinates, direction, numScrolls, holdKeys } = input;
    console.log(
      `Scrolling ${direction} ${numScrolls} times ${coordinates ? `at coordinates: [${coordinates.x}, ${coordinates.y}]` : ''}`,
    );

    try {
      await fetch(
        `${this.configService.get<string>('BYTEBOT_DESKTOP_BASE_URL')}/computer-use`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'scroll',
            coordinates,
            direction,
            numScrolls,
            holdKeys,
          }),
        },
      );
    } catch (error) {
      console.error('Error in scroll action:', error);
      throw error;
    }
  }

  private async typeKeys(input: {
    keys: string[];
    delay?: number;
  }): Promise<void> {
    const { keys, delay } = input;
    console.log(`Typing keys: ${keys}`);

    try {
      await fetch(
        `${this.configService.get<string>('BYTEBOT_DESKTOP_BASE_URL')}/computer-use`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'type_keys',
            keys,
            delay,
          }),
        },
      );
    } catch (error) {
      console.error('Error in type_keys action:', error);
      throw error;
    }
  }

  private async pressKeys(input: {
    keys: string[];
    press: Press;
  }): Promise<void> {
    const { keys, press } = input;
    console.log(`Pressing keys: ${keys}`);

    try {
      await fetch(
        `${this.configService.get<string>('BYTEBOT_DESKTOP_BASE_URL')}/computer-use`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'press_keys',
            keys,
            press,
          }),
        },
      );
    } catch (error) {
      console.error('Error in press_keys action:', error);
      throw error;
    }
  }

  private async typeText(input: {
    text: string;
    delay?: number;
  }): Promise<void> {
    const { text, delay } = input;
    console.log(`Typing text: ${text}`);

    try {
      await fetch(
        `${this.configService.get<string>('BYTEBOT_DESKTOP_BASE_URL')}/computer-use`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'type_text',
            text,
            delay,
          }),
        },
      );
    } catch (error) {
      console.error('Error in type_text action:', error);
      throw error;
    }
  }

  private async wait(input: { duration: number }): Promise<void> {
    const { duration } = input;
    console.log(`Waiting for ${duration}ms`);

    try {
      await fetch(
        `${this.configService.get<string>('BYTEBOT_DESKTOP_BASE_URL')}/computer-use`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'wait',
            duration,
          }),
        },
      );
    } catch (error) {
      console.error('Error in wait action:', error);
      throw error;
    }
  }

  private async cursorPosition(): Promise<Coordinates> {
    console.log('Getting cursor position');

    try {
      const response = await fetch(
        `${this.configService.get<string>('BYTEBOT_DESKTOP_BASE_URL')}/computer-use`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'cursor_position',
          }),
        },
      );

      const data = await response.json();
      return { x: data.x, y: data.y };
    } catch (error) {
      console.error('Error in cursor_position action:', error);
      throw error;
    }
  }

  private async screenshot(): Promise<string> {
    console.log('Taking screenshot');

    try {
      const requestBody = {
        action: 'screenshot',
      };

      const response = await fetch(
        `${this.configService.get<string>('BYTEBOT_DESKTOP_BASE_URL')}/computer-use`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to take screenshot: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.image) {
        throw new Error('Failed to take screenshot: No image data received');
      }

      return data.image; // Base64 encoded image
    } catch (error) {
      console.error('Error in screenshot action:', error);
      throw error;
    }
  }
}
