/**
 * CodeFoldingManager - Manages code folding functionality for BSL files
 * Supports both Russian and English syntax for procedures and functions
 */
class CodeFoldingManager {
  constructor(contentElement) {
    this.contentElement = contentElement;
    this.foldableBlocks = []; // Array of {blockType, startLine, endLine, type, signature, collapsed, element}
    this.foldingState = {}; // Map: lineNumber -> collapsed (boolean)
  }

  /**
   * Parses BSL code content and identifies all procedures and functions
   * Supports both Russian (Процедура, Функция) and English (Procedure, Function) syntax
   * Also identifies comment blocks above procedures/functions
   * @returns {Array} Array of FoldableBlock objects {blockType, startLine, endLine, type, signature}
   */
  parseProceduresAndFunctions() {
    // Defensive check: ensure contentElement exists
    if (!this.contentElement) {
      console.warn('CodeFoldingManager: contentElement is null');
      return [];
    }

    try {
      // Try to find code element, or use contentElement itself if it's already a code element
      let codeElement = this.contentElement;
      if (this.contentElement.tagName !== 'CODE') {
        codeElement = this.contentElement.querySelector('code');
        if (!codeElement) {
          console.warn('CodeFoldingManager: code element not found');
          return [];
        }
      }

      // Defensive check: ensure textContent exists
      if (!codeElement.textContent) {
        console.warn('CodeFoldingManager: code element has no text content');
        return [];
      }

      const lines = codeElement.textContent.split('\n');
      const blocks = [];

      // Regular expressions for procedure/function detection
      // Russian syntax: Процедура, Функция, КонецПроцедуры, КонецФункции
      // English syntax: Procedure, Function, EndProcedure, EndFunction
      // Note: Using explicit character ranges to support Cyrillic characters
      const procedureStartRegex = /^\s*(Процедура|Procedure)\s+([A-Za-zА-Яа-яЁё_][A-Za-zА-Яа-яЁё0-9_]*)/i;
      const functionStartRegex = /^\s*(Функция|Function)\s+([A-Za-zА-Яа-яЁё_][A-Za-zА-Яа-яЁё0-9_]*)/i;
      const procedureEndRegex = /^\s*(КонецПроцедуры|EndProcedure)\s*$/i;
      const functionEndRegex = /^\s*(КонецФункции|EndFunction)\s*$/i;

      let currentBlock = null;

      for (let i = 0; i < lines.length; i++) {
        try {
          const line = lines[i];
          const trimmedLine = line.trim();

          // Check for procedure start
          const procedureMatch = line.match(procedureStartRegex);
          if (procedureMatch && !currentBlock) {
            currentBlock = {
              blockType: 'procedure',  // NEW: Тип блока
              startLine: i,
              endLine: null,
              type: 'procedure',
              signature: this.extractSignature(lines, i),
              collapsed: false,
              element: null
            };
            continue;
          }

          // Check for function start
          const functionMatch = line.match(functionStartRegex);
          if (functionMatch && !currentBlock) {
            currentBlock = {
              blockType: 'function',  // NEW: Тип блока
              startLine: i,
              endLine: null,
              type: 'function',
              signature: this.extractSignature(lines, i),
              collapsed: false,
              element: null
            };
            continue;
          }

          // Check for procedure end
          if (currentBlock && currentBlock.type === 'procedure' && procedureEndRegex.test(trimmedLine)) {
            currentBlock.endLine = i;
            blocks.push(currentBlock);
            currentBlock = null;
            continue;
          }

          // Check for function end
          if (currentBlock && currentBlock.type === 'function' && functionEndRegex.test(trimmedLine)) {
            currentBlock.endLine = i;
            blocks.push(currentBlock);
            currentBlock = null;
            continue;
          }
        } catch (lineError) {
          // Log error for specific line but continue parsing
          console.error(`CodeFoldingManager: Error parsing line ${i}:`, lineError);
          continue;
        }
      }

      // Handle unclosed blocks gracefully - skip them instead of adding incomplete blocks
      if (currentBlock) {
        console.warn(`CodeFoldingManager: Skipping unclosed ${currentBlock.type} at line ${currentBlock.startLine} (missing end keyword)`);
        // Don't add incomplete block to the blocks array
      }

      // Validate blocks before returning
      const validBlocks = blocks.filter(block => {
        if (!block.endLine || block.endLine <= block.startLine) {
          console.warn(`CodeFoldingManager: Skipping malformed block at line ${block.startLine} (invalid end line)`);
          return false;
        }
        if (!block.signature) {
          console.warn(`CodeFoldingManager: Skipping block at line ${block.startLine} (missing signature)`);
          return false;
        }
        return true;
      });

      // NEW: Parse comment blocks above procedures/functions
      const commentBlocks = this.parseCommentBlocks(lines, validBlocks);

      // Combine both types of blocks
      this.foldableBlocks = [...commentBlocks, ...validBlocks];
      
      return this.foldableBlocks;

    } catch (error) {
      // Catch any unexpected errors during parsing
      console.error('CodeFoldingManager: Error parsing BSL code for folding:', error);
      this.foldableBlocks = [];
      return [];
    }
  }

  /**
   * Parses comment blocks above procedures and functions
   * Identifies continuous comment lines (starting with //) that appear directly above a procedure/function
   * @param {Array} lines - All lines of code
   * @param {Array} procedureBlocks - Already identified procedure/function blocks
   * @returns {Array} Array of comment block objects
   */
  parseCommentBlocks(lines, procedureBlocks) {
    const commentBlocks = [];
    const commentRegex = /^\s*\/\//;

    try {
      // For each procedure/function, look for comments above it
      procedureBlocks.forEach(procBlock => {
        try {
          const procStartLine = procBlock.startLine;

          if (procStartLine === 0) return; // No lines above

          let commentEndLine = procStartLine - 1;

          // Skip empty lines between comments and procedure
          while (commentEndLine >= 0 && lines[commentEndLine].trim() === '') {
            commentEndLine--;
          }

          if (commentEndLine < 0) return; // No comments

          // Check if the line is a comment
          if (!commentRegex.test(lines[commentEndLine])) {
            return; // No comments directly above procedure
          }

          let commentStartLine = commentEndLine;

          // Go upwards, collecting STRICTLY continuous comment block
          // Stop at first non-comment line (including empty lines)
          while (commentStartLine > 0) {
            const prevLine = lines[commentStartLine - 1];

            // If previous line is a comment, continue
            if (commentRegex.test(prevLine)) {
              commentStartLine--;
              continue;
            }

            // Otherwise, stop (including empty lines)
            break;
          }

          // If we found a comment block (at least 1 line)
          if (commentStartLine <= commentEndLine) {
            // Skip single-line comments - no need to add fold indicator for them
            const isMultiLine = commentStartLine < commentEndLine;
            if (!isMultiLine) {
              return; // Don't add fold indicator for single-line comments
            }

            // Calculate the first comment line content for display
            const firstCommentLine = lines[commentStartLine].trim();

            commentBlocks.push({
              blockType: 'comment',
              startLine: commentStartLine,
              endLine: commentEndLine,
              relatedProcedureLine: procStartLine,
              firstLineContent: firstCommentLine, // For display when collapsed
              collapsed: false,
              indicator: null,
              verticalLine: null
            });
          }
        } catch (blockError) {
          console.error(`CodeFoldingManager: Error parsing comments for procedure at line ${procBlock.startLine}:`, blockError);
        }
      });

      return commentBlocks;

    } catch (error) {
      console.error('CodeFoldingManager: Error in parseCommentBlocks:', error);
      return [];
    }
  }

  /**
   * Extracts the full signature of a procedure or function
   * Includes: compilation directives, keyword, name, parameters, Export keyword
   * @param {Array} lines - All lines of code
   * @param {number} startLine - Line number where procedure/function starts
   * @returns {string} Full signature
   */
  extractSignature(lines, startLine) {
    try {
      // Defensive checks
      if (!lines || !Array.isArray(lines)) {
        console.error('CodeFoldingManager: Invalid lines array in extractSignature');
        return '';
      }
      if (startLine < 0 || startLine >= lines.length) {
        console.error(`CodeFoldingManager: Invalid startLine ${startLine} in extractSignature`);
        return '';
      }

      let signature = '';
      let currentLine = startLine;

      // Look backwards for compilation directives (&НаКлиенте, &НаСервере, etc.)
      const directiveRegex = /^\s*&\w+/;
      let directiveStartLine = startLine - 1;
      const directives = [];
      
      while (directiveStartLine >= 0 && directiveRegex.test(lines[directiveStartLine])) {
        directives.unshift(lines[directiveStartLine].trim());
        directiveStartLine--;
      }

      // Add directives to signature
      if (directives.length > 0) {
        signature += directives.join(' ') + ' ';
      }

      // Extract the main declaration line(s)
      // Handle multi-line declarations (parameters spanning multiple lines)
      let declarationComplete = false;
      let declarationLines = [];
      
      while (currentLine < lines.length && !declarationComplete) {
        const line = lines[currentLine];
        declarationLines.push(line);
        
        // Check if this line completes the declaration
        // A declaration is complete when we find either:
        // 1. Export keyword at the end
        // 2. End of parameter list without Export
        // 3. No parameters at all
        
        const trimmedLine = line.trim();
        
        // Check for Export keyword
        if (/Экспорт|Export/i.test(trimmedLine)) {
          declarationComplete = true;
        }
        // Check for closing parenthesis (end of parameters)
        else if (trimmedLine.includes(')')) {
          // If there's no Export after the closing paren, we're done
          const afterParen = trimmedLine.substring(trimmedLine.indexOf(')') + 1).trim();
          if (!afterParen || !/Экспорт|Export/i.test(afterParen)) {
            declarationComplete = true;
          } else if (/Экспорт|Export/i.test(afterParen)) {
            declarationComplete = true;
          }
        }
        // Check if there are no parameters (no opening parenthesis on this line)
        else if (currentLine === startLine && !trimmedLine.includes('(')) {
          declarationComplete = true;
        }
        
        currentLine++;
        
        // Safety check: don't go beyond reasonable declaration length
        if (declarationLines.length > 20) {
          console.warn(`CodeFoldingManager: Declaration at line ${startLine} seems too long, truncating`);
          break;
        }
      }

      // Combine declaration lines
      signature += declarationLines.join(' ').trim();

      return signature;

    } catch (error) {
      console.error(`CodeFoldingManager: Error extracting signature at line ${startLine}:`, error);
      return '';
    }
  }

  /**
   * Injects fold indicators into the DOM for all foldable blocks
   * Creates clickable indicators positioned in the gutter (left margin) using line numbers
   * Adds ARIA attributes for accessibility
   * 
   * This method works with already syntax-highlighted code and preserves the highlighting
   */
  injectFoldIndicators() {
    // Defensive check: ensure contentElement exists
    if (!this.contentElement) {
      console.warn('CodeFoldingManager: contentElement is null in injectFoldIndicators');
      return;
    }

    try {
      // Find the pre element (parent of code)
      let preElement = this.contentElement.querySelector('pre');
      if (!preElement) {
        // contentElement might be the pre itself
        preElement = this.contentElement.tagName === 'PRE' ? this.contentElement : null;
      }
      
      if (!preElement) {
        console.warn('CodeFoldingManager: pre element not found in injectFoldIndicators');
        return;
      }

      // Find the code element
      let codeElement = preElement.querySelector('code');
      if (!codeElement) {
        console.warn('CodeFoldingManager: code element not found in injectFoldIndicators');
        return;
      }

      // Defensive check: ensure textContent exists
      if (!codeElement.textContent) {
        console.warn('CodeFoldingManager: code element has no text content in injectFoldIndicators');
        return;
      }

      // Make pre element position: relative for absolute positioning of indicators
      if (getComputedStyle(preElement).position === 'static') {
        preElement.style.position = 'relative';
      }

      // Split code into lines to find actual line positions
      const lines = codeElement.textContent.split('\n');
      
      // For each foldable block, create and position indicator
      this.foldableBlocks.forEach(block => {
        try {
          // Defensive check: ensure block has valid startLine
          if (typeof block.startLine !== 'number' || block.startLine < 0) {
            console.warn(`CodeFoldingManager: Invalid startLine ${block.startLine} for block`);
            return;
          }

          // Create fold indicator
          const indicator = this.createFoldIndicator(block);
          
          if (!indicator) {
            console.warn(`CodeFoldingManager: Failed to create fold indicator for line ${block.startLine}`);
            return;
          }

          // Find the actual position of the line in the rendered code
          const linePosition = this.findLinePosition(codeElement, preElement, block.startLine, lines);
          
          if (linePosition === null) {
            console.warn(`CodeFoldingManager: Could not find position for line ${block.startLine}`);
            return;
          }

          // Position indicator using absolute positioning
          indicator.style.position = 'absolute';
          indicator.style.left = '4px'; // 4px from left edge
          indicator.style.top = `${linePosition}px`;
          indicator.style.zIndex = '10';

          console.log(`CodeFoldingManager: Indicator for line ${block.startLine}, top=${linePosition}px`);

          // Add indicator to pre element
          preElement.appendChild(indicator);
          
          // Create vertical line for expanded state
          const verticalLine = this.createVerticalLine(block, preElement, codeElement, lines);
          if (verticalLine) {
            preElement.appendChild(verticalLine);
            block.verticalLine = verticalLine;
          }
          
          // Store reference to the indicator
          block.indicator = indicator;
          
        } catch (error) {
          console.error(`CodeFoldingManager: Error injecting fold indicator at line ${block.startLine}:`, error);
          // Continue with next block instead of failing completely
        }
      });

    } catch (error) {
      console.error('CodeFoldingManager: Error in injectFoldIndicators:', error);
      // Don't re-throw, allow the viewer to continue functioning
    }
  }

  /**
   * Updates positions of all fold indicators
   * Should be called after collapse/expand to recalculate positions
   */
  updateIndicatorPositions() {
    try {
      // Find the pre and code elements
      let preElement = this.contentElement.querySelector('pre');
      if (!preElement) {
        preElement = this.contentElement.tagName === 'PRE' ? this.contentElement : null;
      }
      
      if (!preElement) {
        console.warn('CodeFoldingManager: pre element not found in updateIndicatorPositions');
        return;
      }

      let codeElement = preElement.querySelector('code');
      if (!codeElement || !codeElement.textContent) {
        console.warn('CodeFoldingManager: code element not found in updateIndicatorPositions');
        return;
      }

      const lines = codeElement.textContent.split('\n');
      const lineHeight = parseFloat(getComputedStyle(codeElement).lineHeight) || 20;

      // Update position for each indicator and vertical line
      this.foldableBlocks.forEach(block => {
        if (!block.indicator) return;

        const startPos = this.findLinePosition(codeElement, preElement, block.startLine, lines);
        
        if (startPos !== null) {
          block.indicator.style.top = `${startPos}px`;
          
          // Update vertical line container position and height
          if (block.verticalLine) {
            const endPos = this.findLinePosition(codeElement, preElement, block.endLine, lines);
            if (endPos !== null) {
              const height = endPos - startPos - lineHeight / 2;
              
              // Update container position
              block.verticalLine.style.top = `${startPos + lineHeight}px`;
              
              // Update vertical line height (first child)
              const verticalLine = block.verticalLine.children[0];
              if (verticalLine) {
                verticalLine.style.height = `${height}px`;
              }
              
              // Update horizontal line position (second child)
              const horizontalLine = block.verticalLine.children[1];
              if (horizontalLine) {
                horizontalLine.style.top = `${height}px`;
              }
            }
          }
        }
      });

    } catch (error) {
      console.error('CodeFoldingManager: Error updating indicator positions:', error);
    }
  }

  /**
   * Finds the actual vertical position of a line in the rendered code
   * @param {HTMLElement} codeElement - The code element
   * @param {HTMLElement} preElement - The pre element (parent)
   * @param {number} targetLine - The line number to find
   * @param {Array} lines - All lines of text
   * @returns {number|null} The top position in pixels, or null if not found
   */
  findLinePosition(codeElement, preElement, targetLine, lines) {
    try {
      // Calculate character position where target line starts
      let charPosition = 0;
      for (let i = 0; i < targetLine; i++) {
        charPosition += lines[i].length + 1; // +1 for newline
      }

      console.log(`CodeFoldingManager: Finding position for line ${targetLine}, charPosition=${charPosition}`);

      // Create a Range to find the exact position of the line start
      const range = document.createRange();
      const walker = document.createTreeWalker(
        codeElement,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );

      let currentPos = 0;
      let node;
      let found = false;

      while (node = walker.nextNode()) {
        if (!node.textContent) continue;
        
        const nodeLength = node.textContent.length;
        
        // Check if this node contains or starts at the target position
        if (currentPos <= charPosition && currentPos + nodeLength > charPosition) {
          // Found the node containing the line start
          const offset = charPosition - currentPos;
          
          console.log(`CodeFoldingManager: Found node at position ${currentPos}, offset=${offset}, nodeText="${node.textContent.substring(0, 20)}..."`);
          
          try {
            range.setStart(node, offset);
            range.setEnd(node, offset);
            
            const rect = range.getBoundingClientRect();
            const preRect = preElement.getBoundingClientRect();
            
            // Calculate position relative to pre element
            const topPosition = rect.top - preRect.top;
            
            console.log(`CodeFoldingManager: Line ${targetLine} position: ${topPosition}px`);
            
            found = true;
            return topPosition;
          } catch (e) {
            console.error('CodeFoldingManager: Error creating range:', e);
            return null;
          }
        }
        
        currentPos += nodeLength;
      }

      if (!found) {
        console.warn(`CodeFoldingManager: Could not find node for line ${targetLine}, charPosition=${charPosition}, totalLength=${currentPos}`);
      }

      return null;
    } catch (error) {
      console.error('CodeFoldingManager: Error in findLinePosition:', error);
      return null;
    }
  }

  /**
   * Finds the DOM node containing the keyword (Процедура/Функция) for a specific line
   * @param {HTMLElement} codeElement - The code element
   * @param {string} keyword - The keyword to find (Процедура, Функция, etc.)
   * @param {number} targetLine - The line number where the keyword should be
   * @param {Array} lines - All lines of text
   * @returns {Object|null} Object with {node, parentNode} or null if not found
   */
  findKeywordNode(codeElement, keyword, targetLine, lines) {
    try {
      // Defensive checks
      if (!codeElement || !keyword || typeof targetLine !== 'number') {
        console.error('CodeFoldingManager: Invalid parameters in findKeywordNode');
        return null;
      }

      // Calculate the character position where the target line starts
      let targetLineStartPos = 0;
      for (let i = 0; i < targetLine; i++) {
        targetLineStartPos += lines[i].length + 1; // +1 for newline
      }

      // Calculate the character position where the keyword appears in the target line
      const lineText = lines[targetLine];
      const keywordIndex = lineText.search(new RegExp(keyword, 'i'));
      if (keywordIndex === -1) {
        return null;
      }

      const keywordStartPos = targetLineStartPos + keywordIndex;
      const keywordEndPos = keywordStartPos + keyword.length;

      // Walk through all text nodes to find the one containing the keyword
      const walker = document.createTreeWalker(
        codeElement,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );
      
      let currentPos = 0;
      let node;
      
      while (node = walker.nextNode()) {
        if (!node.textContent) {
          continue;
        }

        const nodeLength = node.textContent.length;
        const nodeEndPos = currentPos + nodeLength;

        // Check if this node contains the keyword start position
        if (currentPos <= keywordStartPos && nodeEndPos > keywordStartPos) {
          // Found the node containing the keyword
          // Return the node and its parent for insertion
          return {
            node: node,
            parentNode: node.parentNode
          };
        }

        currentPos += nodeLength;
      }
      
      return null;

    } catch (error) {
      console.error('CodeFoldingManager: Error in findKeywordNode:', error);
      return null;
    }
  }

  /**
   * Finds the DOM node at a specific character position in the code element
   * @param {HTMLElement} codeElement - The code element
   * @param {number} targetPosition - The character position to find
   * @returns {Object|null} Object with {node, offset} or null if not found
   */
  findNodeAtPosition(codeElement, targetPosition) {
    try {
      // Defensive checks
      if (!codeElement) {
        console.error('CodeFoldingManager: codeElement is null in findNodeAtPosition');
        return null;
      }
      if (typeof targetPosition !== 'number' || targetPosition < 0) {
        console.error(`CodeFoldingManager: Invalid targetPosition ${targetPosition} in findNodeAtPosition`);
        return null;
      }

      let currentPosition = 0;
      
      // Walk through all text nodes
      const walker = document.createTreeWalker(
        codeElement,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );
      
      let node;
      while (node = walker.nextNode()) {
        // Defensive check: ensure node has textContent
        if (!node.textContent) {
          continue;
        }

        const nodeLength = node.textContent.length;
        
        if (currentPosition + nodeLength >= targetPosition) {
          // Found the node containing the target position
          return {
            node: node,
            offset: targetPosition - currentPosition
          };
        }
        
        currentPosition += nodeLength;
      }
      
      return null;

    } catch (error) {
      console.error('CodeFoldingManager: Error in findNodeAtPosition:', error);
      return null;
    }
  }

  /**
   * Creates a fold indicator element with appropriate attributes and styling
   * @param {Object} block - The foldable block object
   * @returns {HTMLElement} The fold indicator span element
   */
  createFoldIndicator(block) {
    try {
      // Defensive check: ensure block is valid
      if (!block || typeof block !== 'object') {
        console.error('CodeFoldingManager: Invalid block in createFoldIndicator');
        return null;
      }

      const indicator = document.createElement('span');
      indicator.className = 'fold-indicator';
      indicator.setAttribute('data-line', block.startLine);
      indicator.setAttribute('data-block-type', block.blockType); // NEW: Block type
      indicator.setAttribute('data-collapsed', 'false');
      indicator.setAttribute('role', 'button');
      indicator.setAttribute('tabindex', '0');
      indicator.setAttribute('aria-expanded', 'true');
      
      // Create accessible label based on block type
      if (block.blockType === 'comment') {
        indicator.setAttribute('aria-label', 'Свернуть комментарии');
      } else {
        const blockType = block.type === 'procedure' ? 'процедуру' : 'функцию';
        const blockName = this.extractBlockName(block.signature || '');
        indicator.setAttribute('aria-label', `Свернуть ${blockType} ${blockName}`);
      }
      
      // Set the symbol for expanded state
      indicator.textContent = '⊟';
      
      return indicator;

    } catch (error) {
      console.error('CodeFoldingManager: Error creating fold indicator:', error);
      return null;
    }
  }

  /**
   * Creates a vertical line element for a foldable block
   * Shows the extent of the block from start to end
   * @param {Object} block - The foldable block object
   * @param {HTMLElement} preElement - The pre element
   * @param {HTMLElement} codeElement - The code element
   * @param {Array} lines - All lines of text
   * @returns {HTMLElement|null} The vertical line element or null
   */
  createVerticalLine(block, preElement, codeElement, lines) {
    try {
      if (!block || typeof block.startLine !== 'number' || typeof block.endLine !== 'number') {
        return null;
      }

      // Find positions of start and end lines
      const startPos = this.findLinePosition(codeElement, preElement, block.startLine, lines);
      const endPos = this.findLinePosition(codeElement, preElement, block.endLine, lines);

      if (startPos === null || endPos === null) {
        return null;
      }

      // Get line height to calculate proper end position
      const lineHeight = parseFloat(getComputedStyle(codeElement).lineHeight) || 20;

      // Create container for vertical line and horizontal end cap
      const container = document.createElement('div');
      container.className = 'fold-line-container';
      container.style.position = 'absolute';
      container.style.left = '11px'; // Center of the indicator (4px + 16px/2 - 1px)
      container.style.top = `${startPos + lineHeight}px`; // Start below the indicator
      container.style.zIndex = '5';

      // Vertical line
      const verticalLine = document.createElement('div');
      verticalLine.style.position = 'absolute';
      verticalLine.style.left = '0';
      verticalLine.style.top = '0';
      verticalLine.style.height = `${endPos - startPos - lineHeight / 2}px`;
      verticalLine.style.width = '1px';
      verticalLine.style.backgroundColor = 'var(--muted)';
      verticalLine.style.opacity = '0.3';

      // Horizontal line at the end (pointing right)
      const horizontalLine = document.createElement('div');
      horizontalLine.style.position = 'absolute';
      horizontalLine.style.left = '0';
      horizontalLine.style.top = `${endPos - startPos - lineHeight / 2}px`;
      horizontalLine.style.width = '8px'; // Short horizontal line
      horizontalLine.style.height = '1px';
      horizontalLine.style.backgroundColor = 'var(--muted)';
      horizontalLine.style.opacity = '0.3';

      container.appendChild(verticalLine);
      container.appendChild(horizontalLine);

      return container;

    } catch (error) {
      console.error('CodeFoldingManager: Error creating vertical line:', error);
      return null;
    }
  }

  /**
   * Extracts the procedure/function name from the signature
   * @param {string} signature - The full signature string
   * @returns {string} The procedure/function name
   */
  extractBlockName(signature) {
    try {
      // Defensive check: ensure signature is a string
      if (typeof signature !== 'string') {
        console.warn('CodeFoldingManager: Invalid signature type in extractBlockName');
        return 'неизвестно';
      }

      // Match procedure or function name
      const match = signature.match(/(?:Процедура|Функция|Procedure|Function)\s+([A-Za-zА-Яа-яЁё_][A-Za-zА-Яа-яЁё0-9_]*)/i);
      return match ? match[1] : 'неизвестно';

    } catch (error) {
      console.error('CodeFoldingManager: Error extracting block name:', error);
      return 'неизвестно';
    }
  }

  /**
   * Returns the current folding state
   * @returns {Object} Map: lineNumber -> collapsed (boolean)
   */
  getFoldingState() {
    try {
      // Return a copy to prevent external modification
      return { ...this.foldingState };
    } catch (error) {
      console.error('CodeFoldingManager: Error getting folding state:', error);
      return {};
    }
  }

  /**
   * Restores folding state from saved state object
   * Handles invalid state gracefully by skipping invalid entries
   * @param {Object} state - Map: lineNumber -> collapsed (boolean)
   */
  restoreFoldingState(state) {
    try {
      // Defensive check: ensure state is valid
      if (!state || typeof state !== 'object') {
        console.warn('CodeFoldingManager: Invalid state object in restoreFoldingState');
        return;
      }

      Object.entries(state).forEach(([lineNumber, collapsed]) => {
        try {
          const line = parseInt(lineNumber, 10);
          
          // Validate line number
          if (isNaN(line) || line < 0) {
            console.warn(`CodeFoldingManager: Invalid line number ${lineNumber} in folding state, skipping`);
            return;
          }

          // Find the block at this line
          const block = this.foldableBlocks.find(b => b.startLine === line);
          
          if (block && typeof collapsed === 'boolean') {
            if (collapsed) {
              this.collapseBlock(line);
            }
          } else if (!block) {
            // Silently skip if block doesn't exist at this line (file may have changed)
            console.debug(`CodeFoldingManager: No block found at line ${line}, skipping`);
          }
        } catch (entryError) {
          console.error(`CodeFoldingManager: Error restoring state for line ${lineNumber}:`, entryError);
          // Continue with next entry
        }
      });

    } catch (error) {
      console.error('CodeFoldingManager: Error in restoreFoldingState:', error);
      // Don't re-throw, allow the viewer to continue functioning
    }
  }

  /**
   * Toggles the fold state of a block between collapsed and expanded
   * @param {number} lineNumber - Line number of the block to toggle
   */
  toggleFold(lineNumber) {
    try {
      // Defensive checks
      if (typeof lineNumber !== 'number' || lineNumber < 0) {
        console.error(`CodeFoldingManager: Invalid line number ${lineNumber} in toggleFold`);
        return;
      }

      const block = this.foldableBlocks.find(b => b.startLine === lineNumber);
      if (!block) {
        console.error(`CodeFoldingManager: Block not found for line ${lineNumber}`);
        return;
      }
      if (!block.indicator) {
        console.error(`CodeFoldingManager: Indicator not found for block at line ${lineNumber}`);
        return;
      }

      if (block.collapsed) {
        this.expandBlock(lineNumber);
      } else {
        this.collapseBlock(lineNumber);
      }

    } catch (error) {
      console.error(`CodeFoldingManager: Error toggling fold at line ${lineNumber}:`, error);
      // Don't re-throw, allow the viewer to continue functioning
    }
  }

  /**
   * Collapses a procedure or function block
   * Hides all lines between declaration and end keyword
   * Shows only signature line with ellipsis indicator
   * @param {number} lineNumber - Line number of the block to collapse
   */
  collapseBlock(lineNumber) {
    try {
      // Defensive checks
      if (typeof lineNumber !== 'number' || lineNumber < 0) {
        console.error(`CodeFoldingManager: Invalid line number ${lineNumber} in collapseBlock`);
        return;
      }

      const block = this.foldableBlocks.find(b => b.startLine === lineNumber);
      if (!block) {
        console.error(`CodeFoldingManager: Block not found for line ${lineNumber}`);
        return;
      }
      if (!block.indicator) {
        console.error(`CodeFoldingManager: Indicator not found for block at line ${lineNumber}`);
        return;
      }

      if (block.collapsed) {
        return; // Already collapsed
      }

      // Find the code element
      let codeElement = this.contentElement;
      if (this.contentElement.tagName !== 'CODE') {
        codeElement = this.contentElement.querySelector('code');
        if (!codeElement) {
          console.error('CodeFoldingManager: code element not found in collapseBlock');
          return;
        }
      }

      // Defensive check: ensure textContent exists
      if (!codeElement.textContent) {
        console.error('CodeFoldingManager: code element has no text content in collapseBlock');
        return;
      }

      // Get all text content and split into lines
      const textContent = codeElement.textContent;
      const lines = textContent.split('\n');

      // Determine what to collapse based on block type
      let bodyStartLine, bodyEndLine;

      if (block.blockType === 'comment') {
        // For comments: hide all lines except the first one
        bodyStartLine = block.startLine + 1; // From second comment line
        bodyEndLine = block.endLine;         // To last comment line
        
        // Find any empty lines after the last comment line (before the procedure)
        let lastLineToHide = bodyEndLine;
        while (lastLineToHide + 1 < lines.length && lines[lastLineToHide + 1].trim() === '') {
          lastLineToHide++;
        }
        bodyEndLine = lastLineToHide;
      } else {
        // For procedures/functions: hide body (existing logic)
        bodyStartLine = block.startLine + 1; // After declaration
        bodyEndLine = block.endLine;         // Up to and including КонецПроцедуры/КонецФункции
        
        // Find any empty lines after КонецПроцедуры/КонецФункции
        let lastLineToHide = bodyEndLine;
        while (lastLineToHide + 1 < lines.length && lines[lastLineToHide + 1].trim() === '') {
          lastLineToHide++;
        }
        bodyEndLine = lastLineToHide;
      }

      if (bodyStartLine > bodyEndLine) {
        // No body to hide (empty block or single-line comment)
        // Still update the indicator
        block.indicator.textContent = '⊞';
        block.indicator.setAttribute('data-collapsed', 'true');
        block.indicator.setAttribute('aria-expanded', 'false');
        
        if (block.blockType === 'comment') {
          block.indicator.setAttribute('aria-label', 'Развернуть комментарии');
        } else {
          const blockType = block.type === 'procedure' ? 'процедуру' : 'функцию';
          const blockName = this.extractBlockName(block.signature);
          block.indicator.setAttribute('aria-label', `Развернуть ${blockType} ${blockName}`);
        }
        
        block.collapsed = true;
        this.foldingState[lineNumber] = true;
        return;
      }

      // Calculate character positions for each line
      const lineStartPositions = [0];
      for (let i = 0; i < lines.length - 1; i++) {
        lineStartPositions.push(lineStartPositions[i] + lines[i].length + 1);
      }

      // Validate line positions
      if (bodyStartLine >= lineStartPositions.length || bodyEndLine >= lines.length) {
        console.error(`CodeFoldingManager: Invalid body line range [${bodyStartLine}, ${bodyEndLine}] for collapse`);
        return;
      }

      let bodyStartPos, bodyEndPos;

      if (block.blockType === 'comment') {
        // For comments: hide from start of second line to end of last line (including empty lines)
        bodyStartPos = lineStartPositions[bodyStartLine];
        // End position: end of last line to hide (including \n if not last line)
        if (bodyEndLine < lines.length - 1) {
          bodyEndPos = lineStartPositions[bodyEndLine + 1]; // Include the \n after last line
        } else {
          bodyEndPos = lineStartPositions[bodyEndLine] + lines[bodyEndLine].length;
        }
      } else {
        // For procedures/functions: existing logic
        bodyStartPos = lineStartPositions[bodyStartLine];
        bodyEndPos = lineStartPositions[bodyEndLine] + lines[bodyEndLine].length;
      }

      // Wrap the body content in a span with display: none
      const bodyWrapper = document.createElement('span');
      bodyWrapper.className = 'fold-body';
      bodyWrapper.setAttribute('data-start', bodyStartLine);
      bodyWrapper.setAttribute('data-end', bodyEndLine);
      bodyWrapper.setAttribute('data-block-type', block.blockType); // NEW
      bodyWrapper.style.display = 'none';

      // Find and wrap the body nodes
      this.wrapTextRange(codeElement, bodyStartPos, bodyEndPos, bodyWrapper);

      // Update fold indicator
      block.indicator.textContent = '⊞';
      block.indicator.setAttribute('data-collapsed', 'true');
      block.indicator.setAttribute('aria-expanded', 'false');
      
      if (block.blockType === 'comment') {
        block.indicator.setAttribute('aria-label', 'Развернуть комментарии');
      } else {
        const blockType = block.type === 'procedure' ? 'процедуру' : 'функцию';
        const blockName = this.extractBlockName(block.signature);
        block.indicator.setAttribute('aria-label', `Развернуть ${blockType} ${blockName}`);
      }

      // Hide vertical line when collapsed
      if (block.verticalLine) {
        block.verticalLine.style.display = 'none';
      }

      // Add collapsed line styling
      // We'll add the class to the code element's parent (the pre element typically)
      if (this.contentElement.classList) {
        // Store original classes to restore later
        if (!block.originalClasses) {
          block.originalClasses = this.contentElement.className;
        }
      }

      // Update state
      block.collapsed = true;
      block.bodyWrapper = bodyWrapper;
      this.foldingState[lineNumber] = true;

      // Update positions of all indicators after collapse
      // Use setTimeout to allow DOM to update first
      setTimeout(() => {
        this.updateIndicatorPositions();
      }, 0);

    } catch (error) {
      console.error(`CodeFoldingManager: Error collapsing block at line ${lineNumber}:`, error);
      // Don't re-throw, allow the viewer to continue functioning
    }
  }

  /**
   * Expands a collapsed procedure or function block
   * Shows all lines from declaration to end keyword
   * Removes ellipsis indicator
   * @param {number} lineNumber - Line number of the block to expand
   */
  expandBlock(lineNumber) {
    try {
      // Defensive checks
      if (typeof lineNumber !== 'number' || lineNumber < 0) {
        console.error(`CodeFoldingManager: Invalid line number ${lineNumber} in expandBlock`);
        return;
      }

      const block = this.foldableBlocks.find(b => b.startLine === lineNumber);
      if (!block) {
        console.error(`CodeFoldingManager: Block not found for line ${lineNumber}`);
        return;
      }
      if (!block.indicator) {
        console.error(`CodeFoldingManager: Indicator not found for block at line ${lineNumber}`);
        return;
      }

      if (!block.collapsed) {
        return; // Already expanded
      }

      // Show the body wrapper
      if (block.bodyWrapper) {
        block.bodyWrapper.style.display = '';
      }

      // Update fold indicator
      block.indicator.textContent = '⊟';
      block.indicator.setAttribute('data-collapsed', 'false');
      block.indicator.setAttribute('aria-expanded', 'true');
      
      if (block.blockType === 'comment') {
        block.indicator.setAttribute('aria-label', 'Свернуть комментарии');
      } else {
        const blockType = block.type === 'procedure' ? 'процедуру' : 'функцию';
        const blockName = this.extractBlockName(block.signature);
        block.indicator.setAttribute('aria-label', `Свернуть ${blockType} ${blockName}`);
      }

      // Show vertical line when expanded
      if (block.verticalLine) {
        block.verticalLine.style.display = '';
      }

      // Remove collapsed line styling
      if (block.indicator.parentElement) {
        block.indicator.parentElement.classList.remove('fold-collapsed-line');
      }

      // Restore original classes if they were stored
      if (block.originalClasses !== undefined && this.contentElement.classList) {
        this.contentElement.className = block.originalClasses;
      }

      // Update state
      block.collapsed = false;
      block.bodyWrapper = null;
      this.foldingState[lineNumber] = false;

      // Update positions of all indicators after expand
      // Use setTimeout to allow DOM to update first
      setTimeout(() => {
        this.updateIndicatorPositions();
      }, 0);

    } catch (error) {
      console.error(`CodeFoldingManager: Error expanding block at line ${lineNumber}:`, error);
      // Don't re-throw, allow the viewer to continue functioning
    }
  }

  /**
   * Wraps a range of text content in a wrapper element
   * @param {HTMLElement} container - The container element
   * @param {number} startPos - Start character position
   * @param {number} endPos - End character position
   * @param {HTMLElement} wrapper - The wrapper element to use
   */
  wrapTextRange(container, startPos, endPos, wrapper) {
    try {
      // Defensive checks
      if (!container) {
        console.error('CodeFoldingManager: container is null in wrapTextRange');
        return;
      }
      if (!wrapper) {
        console.error('CodeFoldingManager: wrapper is null in wrapTextRange');
        return;
      }
      if (typeof startPos !== 'number' || typeof endPos !== 'number') {
        console.error('CodeFoldingManager: Invalid position values in wrapTextRange');
        return;
      }
      if (startPos < 0 || endPos < startPos) {
        console.error(`CodeFoldingManager: Invalid range [${startPos}, ${endPos}] in wrapTextRange`);
        return;
      }

      const range = document.createRange();
      let currentPos = 0;
      let startNode = null;
      let startOffset = 0;
      let endNode = null;
      let endOffset = 0;

      // Find start and end nodes
      const walker = document.createTreeWalker(
        container,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );

      let node;
      while (node = walker.nextNode()) {
        // Defensive check: ensure node has textContent
        if (!node.textContent) {
          continue;
        }

        const nodeLength = node.textContent.length;

        // Check if this node contains the start position
        if (!startNode && currentPos + nodeLength >= startPos) {
          startNode = node;
          startOffset = startPos - currentPos;
        }

        // Check if this node contains the end position
        if (currentPos + nodeLength >= endPos) {
          endNode = node;
          endOffset = endPos - currentPos;
          break;
        }

        currentPos += nodeLength;
      }

      if (!startNode || !endNode) {
        console.warn('CodeFoldingManager: Could not find start or end node for wrapping');
        return;
      }

      range.setStart(startNode, startOffset);
      range.setEnd(endNode, endOffset);
      
      // Extract the contents and wrap them
      const contents = range.extractContents();
      wrapper.appendChild(contents);
      range.insertNode(wrapper);

    } catch (error) {
      console.error('CodeFoldingManager: Error wrapping text range:', error);
      // Don't re-throw, allow the viewer to continue functioning
    }
  }

  /**
   * Attaches event listeners for fold indicators using event delegation
   * Handles both click and keyboard events (Enter/Space) for accessibility
   * Uses event delegation on the content element for better performance
   */
  attachFoldEventListeners() {
    // Defensive check: ensure contentElement exists
    if (!this.contentElement) {
      console.warn('CodeFoldingManager: contentElement is null in attachFoldEventListeners');
      return;
    }

    try {
      // Store bound event handlers for cleanup
      this.clickHandler = this.handleFoldClick.bind(this);
      this.keydownHandler = this.handleFoldKeydown.bind(this);

      // Use event delegation on the content element
      this.contentElement.addEventListener('click', this.clickHandler);
      this.contentElement.addEventListener('keydown', this.keydownHandler);

    } catch (error) {
      console.error('CodeFoldingManager: Error attaching fold event listeners:', error);
      // Don't re-throw, allow the viewer to continue functioning
    }
  }

  /**
   * Handles click events on fold indicators
   * Uses event delegation to handle clicks on any fold indicator
   * @param {MouseEvent} event - The click event
   */
  handleFoldClick(event) {
    try {
      // Check if the clicked element is a fold indicator
      const indicator = event.target.closest('.fold-indicator');
      if (!indicator) {
        return;
      }

      // Prevent the click from interfering with text selection
      event.stopPropagation();

      // Get the line number from the data attribute
      const lineNumber = parseInt(indicator.getAttribute('data-line'), 10);
      if (isNaN(lineNumber)) {
        console.error('CodeFoldingManager: Invalid line number on fold indicator');
        return;
      }

      // Toggle the fold state
      this.toggleFold(lineNumber);

    } catch (error) {
      console.error('CodeFoldingManager: Error handling fold click:', error);
      // Don't re-throw, allow the viewer to continue functioning
    }
  }

  /**
   * Handles keyboard events on fold indicators for accessibility
   * Responds to Enter and Space keys
   * @param {KeyboardEvent} event - The keyboard event
   */
  handleFoldKeydown(event) {
    try {
      // Check if the focused element is a fold indicator
      const indicator = event.target.closest('.fold-indicator');
      if (!indicator) {
        return;
      }

      // Only handle Enter and Space keys
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }

      // Prevent default behavior (e.g., scrolling for Space)
      event.preventDefault();
      event.stopPropagation();

      // Get the line number from the data attribute
      const lineNumber = parseInt(indicator.getAttribute('data-line'), 10);
      if (isNaN(lineNumber)) {
        console.error('CodeFoldingManager: Invalid line number on fold indicator');
        return;
      }

      // Toggle the fold state
      this.toggleFold(lineNumber);

    } catch (error) {
      console.error('CodeFoldingManager: Error handling fold keydown:', error);
      // Don't re-throw, allow the viewer to continue functioning
    }
  }

  /**
   * Collapses all foldable blocks
   */
  collapseAll() {
    try {
      this.foldableBlocks.forEach(block => {
        if (!block.collapsed) {
          this.collapseBlock(block.startLine);
        }
      });
    } catch (error) {
      console.error('CodeFoldingManager: Error collapsing all blocks:', error);
    }
  }

  /**
   * Expands all foldable blocks
   */
  expandAll() {
    try {
      this.foldableBlocks.forEach(block => {
        if (block.collapsed) {
          this.expandBlock(block.startLine);
        }
      });
    } catch (error) {
      console.error('CodeFoldingManager: Error expanding all blocks:', error);
    }
  }

  /**
   * Cleans up event listeners and state
   * Should be called when the CodeFoldingManager is no longer needed
   */
  cleanup() {
    try {
      // Remove event listeners if they were attached
      if (this.contentElement && this.clickHandler) {
        this.contentElement.removeEventListener('click', this.clickHandler);
      }
      if (this.contentElement && this.keydownHandler) {
        this.contentElement.removeEventListener('keydown', this.keydownHandler);
      }

      // Clear references
      this.clickHandler = null;
      this.keydownHandler = null;
      this.foldableBlocks = [];
      this.foldingState = {};
      this.contentElement = null;

    } catch (error) {
      console.error('CodeFoldingManager: Error during cleanup:', error);
      // Still clear references even if there's an error
      this.clickHandler = null;
      this.keydownHandler = null;
      this.foldableBlocks = [];
      this.foldingState = {};
      this.contentElement = null;
    }
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CodeFoldingManager;
}
