import React from "react";
import {
  MessageContentBlock,
  isTextContentBlock,
  isImageContentBlock,
  isComputerToolUseContentBlock,
  isToolResultContentBlock,
  isThinkingContentBlock,
  isRedactedThinkingContentBlock,
} from "@bytebot/shared";
import { TextContent } from "./TextContent";
import { ImageContent } from "./ImageContent";
import { ComputerToolContent } from "./ComputerToolContent";
import { ErrorContent } from "./ErrorContent";

interface MessageContentProps {
  content: MessageContentBlock[];
  isTakeOver?: boolean;
}

export function MessageContent({
  content,
  isTakeOver = false,
}: MessageContentProps) {
  // Filter content blocks and check if any visible content remains
  const visibleBlocks = content.filter((block) => {
    // Show tool results that contain images or text, or errors; hide truly empty tool results
    if (isToolResultContentBlock(block)) {
      if (block.is_error) return true;
      if (!block.content || block.content.length === 0) return false;
      return block.content.some(
        (contentBlock) =>
          isImageContentBlock(contentBlock) || isTextContentBlock(contentBlock),
      );
    }
    return true;
  });

  // Skip rendering if no visible content
  if (visibleBlocks.length === 0) {
    return null;
  }

  return (
    <div className="w-full">
      {visibleBlocks.map((block, index) => (
        <div key={index}>
          {isTextContentBlock(block) && <TextContent block={block} />}

          {isThinkingContentBlock(block) && (
            <details className="mb-2">
              <summary className="cursor-pointer text-xs text-bytebot-bronze-dark-9">
                Reasoning
              </summary>
              <pre className="mt-1 whitespace-pre-wrap rounded border p-2 text-[11px] leading-snug">
                {block.thinking}
              </pre>
            </details>
          )}

          {isRedactedThinkingContentBlock(block) && (
            <details className="mb-2">
              <summary className="cursor-pointer text-xs text-bytebot-bronze-dark-9">
                Reasoning (redacted)
              </summary>
              <pre className="mt-1 whitespace-pre-wrap rounded border p-2 text-[11px] leading-snug">
                {block.data}
              </pre>
            </details>
          )}

          {isToolResultContentBlock(block) &&
            !block.is_error &&
            block.content.map((contentBlock, contentBlockIndex) => {
              if (isImageContentBlock(contentBlock)) {
                return (
                  <ImageContent key={contentBlockIndex} block={contentBlock} />
                );
              }
              if (isTextContentBlock(contentBlock)) {
                return <TextContent key={contentBlockIndex} block={contentBlock} />;
              }
              return null;
            })}

          {isComputerToolUseContentBlock(block) && (
            <ComputerToolContent block={block} isTakeOver={isTakeOver} />
          )}

          {isToolResultContentBlock(block) && block.is_error && (
            <ErrorContent block={block} />
          )}
        </div>
      ))}
    </div>
  );
}
