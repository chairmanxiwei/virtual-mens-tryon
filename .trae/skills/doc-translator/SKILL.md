---
name: "doc-translator"
description: "Automatically translates English documentation to Chinese. Invoke when encountering English documentation or when the user asks for translation."
---

# Documentation Translator

This skill automatically translates English documentation to Chinese.

## Usage
- **Invoke when**: You encounter English documentation or the user asks to translate a document.
- **Goal**: Provide a clear, accurate, and context-aware translation.

## Guidelines
1.  **Preserve Formatting**: Maintain markdown structure (headers, lists, code blocks).
2.  **Translate Content**: Translate the English text to Chinese.
3.  **Context**: Ensure technical terms are translated appropriately or kept in English if standard.
4.  **Tone**: maintain a professional and technical tone suitable for documentation.

## Example
**Input**:
`# Installation`
`Run npm install to install dependencies.`

**Output**:
`# 安装`
`运行 npm install 安装依赖项。`
