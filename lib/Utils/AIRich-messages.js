const _crypto = require("crypto");
const _ffmpeg = require("fluent-ffmpeg");
const _stream = require("stream");
const _sharp = require("sharp");
const { Readable, PassThrough } = _stream;
const WAProto = require('../../WAProto').proto;
const Utils_1 = require("../Utils");

const JS_KEYWORDS = new Set([
  "import", "export", "from", "default", "as", "const", "let", "var",
  "function", "class", "extends", "new", "return", "if", "else", "for",
  "while", "do", "switch", "case", "break", "continue", "try", "catch",
  "finally", "throw", "async", "await", "yield", "typeof", "instanceof",
  "in", "of", "delete", "void", "true", "false", "null", "undefined",
  "NaN", "Infinity", "this", "super", "static", "get", "set", "debugger",
  "with",
]);

const PYTHON_KEYWORDS = new Set([
  "import", "from", "as", "def", "class", "return", "if", "elif", "else",
  "for", "while", "break", "continue", "try", "except", "finally", "raise",
  "with", "yield", "lambda", "pass", "del", "global", "nonlocal", "assert",
  "True", "False", "None", "and", "or", "not", "in", "is", "async", "await",
  "self", "print",
]);

const GO_KEYWORDS = new Set([
  "func", "package", "import", "return", "if", "else", "for", "switch",
  "case", "break", "continue", "type", "struct", "interface", "map",
  "chan", "go", "defer", "const", "var", "range", "true", "false", "nil",
  "select", "default", "fallthrough",
]);

const LUA_KEYWORDS = new Set([
  "function", "end", "if", "then", "else", "elseif", "for", "while", "do",
  "local", "return", "true", "false", "nil", "repeat", "until", "in",
  "not", "and", "or",
]);

const BASH_KEYWORDS = new Set([
  "if", "then", "else", "elif", "fi", "for", "while", "do", "done", "case",
  "esac", "echo", "export", "return", "in", "function", "local", "read",
  "set", "unset", "true", "false", "exit", "source", "alias", "declare",
  "typeset",
]);

const LANGUAGE_KEYWORDS = {
  javascript: JS_KEYWORDS,
  typescript: JS_KEYWORDS,
  js: JS_KEYWORDS,
  ts: JS_KEYWORDS,
  python: PYTHON_KEYWORDS,
  py: PYTHON_KEYWORDS,
  go: GO_KEYWORDS,
  golang: GO_KEYWORDS,
  lua: LUA_KEYWORDS,
  bash: BASH_KEYWORDS,
  sh: BASH_KEYWORDS,
  shell: BASH_KEYWORDS,
};

var CodeHighlightType;
(function (CodeHighlightType) {
  CodeHighlightType[(CodeHighlightType["DEFAULT"] = 0)] = "DEFAULT";
  CodeHighlightType[(CodeHighlightType["KEYWORD"] = 1)] = "KEYWORD";
  CodeHighlightType[(CodeHighlightType["METHOD"] = 2)] = "METHOD";
  CodeHighlightType[(CodeHighlightType["STRING"] = 3)] = "STRING";
  CodeHighlightType[(CodeHighlightType["NUMBER"] = 4)] = "NUMBER";
  CodeHighlightType[(CodeHighlightType["COMMENT"] = 5)] = "COMMENT";
})(CodeHighlightType || (CodeHighlightType = {}));

var RichSubMessageType;
(function (RichSubMessageType) {
  RichSubMessageType[(RichSubMessageType["UNKNOWN"] = 0)] = "UNKNOWN";
  RichSubMessageType[(RichSubMessageType["GRID_IMAGE"] = 1)] = "GRID_IMAGE";
  RichSubMessageType[(RichSubMessageType["TEXT"] = 2)] = "TEXT";
  RichSubMessageType[(RichSubMessageType["INLINE_IMAGE"] = 3)] = "INLINE_IMAGE";
  RichSubMessageType[(RichSubMessageType["TABLE"] = 4)] = "TABLE";
  RichSubMessageType[(RichSubMessageType["CODE"] = 5)] = "CODE";
  RichSubMessageType[(RichSubMessageType["DYNAMIC"] = 6)] = "DYNAMIC";
  RichSubMessageType[(RichSubMessageType["MAP"] = 7)] = "MAP";
  RichSubMessageType[(RichSubMessageType["LATEX"] = 8)] = "LATEX";
  RichSubMessageType[(RichSubMessageType["CONTENT_ITEMS"] = 9)] = "CONTENT_ITEMS";
})(RichSubMessageType || (RichSubMessageType = {}));

const tokenizeCode = (codeStr, language = "javascript") => {
  const keywords = LANGUAGE_KEYWORDS[language] || JS_KEYWORDS;
  const blocks = [];
  const lines = codeStr.split("\n");
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const isLast = li === lines.length - 1;
    const nl = isLast ? "" : "\n";
    if (!line.trim()) {
      blocks.push({
        highlightType: CodeHighlightType.DEFAULT,
        codeContent: line + nl,
      });
      continue;
    }
    if (line.trim().startsWith("//") || line.trim().startsWith("#")) {
      blocks.push({
        highlightType: CodeHighlightType.COMMENT,
        codeContent: line + nl,
      });
      continue;
    }
    const regex = /(\/\/.*$|#.*$)|(["'`](?:[^"'`\\]|\\.)*["'`])|(\b\d+(?:\.\d+)?\b)|(\b[a-zA-Z_$][\w$]*\b)|([^\s\w$"'`]+)|(\s+)/g;
    let match;
    const tokens = [];
    while ((match = regex.exec(line)) !== null) {
      const val = match[0];
      if (match[1]) {
        tokens.push({ highlightType: CodeHighlightType.COMMENT, codeContent: val });
      } else if (match[2]) {
        tokens.push({ highlightType: CodeHighlightType.STRING, codeContent: val });
      } else if (match[3]) {
        tokens.push({ highlightType: CodeHighlightType.NUMBER, codeContent: val });
      } else if (match[4]) {
        if (keywords.has(val)) {
          tokens.push({ highlightType: CodeHighlightType.KEYWORD, codeContent: val });
        } else {
          const after = line.slice(regex.lastIndex).trimStart();
          if (after.startsWith("(")) {
            tokens.push({ highlightType: CodeHighlightType.METHOD, codeContent: val });
          } else {
            tokens.push({ highlightType: CodeHighlightType.DEFAULT, codeContent: val });
          }
        }
      } else {
        tokens.push({ highlightType: CodeHighlightType.DEFAULT, codeContent: val });
      }
    }
    if (tokens.length === 0) {
      blocks.push({ highlightType: CodeHighlightType.DEFAULT, codeContent: line + nl });
      continue;
    }
    const merged = [];
    for (const t of tokens) {
      const prev = merged.length > 0 ? merged[merged.length - 1] : undefined;
      if (prev && prev.highlightType === t.highlightType) {
        prev.codeContent += t.codeContent;
      } else {
        merged.push({ ...t });
      }
    }
    if (merged.length > 0) {
      merged[merged.length - 1].codeContent += nl;
    }
    blocks.push(...merged);
  }
  return blocks;
};

const buildRichContextInfo = (quoted) => {
  const ctxInfo = {
    forwardingScore: 1,
    isForwarded: true,
    forwardedAiBotMessageInfo: { botJid: "867051314767696@bot" },
    forwardOrigin: 4,
  };
  if (quoted?.key) {
    ctxInfo.stanzaId = quoted.key.id;
    ctxInfo.participant = quoted.key.participant || quoted.sender || quoted.key.remoteJid;
    ctxInfo.quotedMessage = quoted.message;
  }
  return ctxInfo;
};

const buildBotForwardedMessage = (submessages = [], contextInfo, unifiedResponse) => {
  const richResponse = {
    messageType: 1,
    submessages: Array.isArray(submessages) ? submessages : [],
    contextInfo,
  };
  if (unifiedResponse) {
    richResponse.unifiedResponse = unifiedResponse;
  }
  return {
    botForwardedMessage: {
      message: {
        richResponseMessage: richResponse,
      },
    },
  };
};

const buildImageMetadata = (imageUrl, imageText = "", alignment = 2) => {
  const safeUrl = typeof imageUrl === "string" ? imageUrl : "";
  return {
    imageUrl: {
      imagePreviewUrl: safeUrl,
      imageHighResUrl: safeUrl,
    },
    imageText,
    alignment,
  };
};

const generateTableContent = (title, headers, rows, quoted, options = {}) => {
  const { footer, headerText } = options;
  const tableRows = [
    { items: headers, isHeading: true },
    ...rows.map((row) => ({ items: row.map(String) })),
  ];
  const submessages = [];
  if (headerText) {
    submessages.push({ messageType: 2, messageText: headerText });
  }
  submessages.push({
    messageType: 4,
    tableMetadata: { title, rows: tableRows },
  });
  if (footer) {
    submessages.push({ messageType: 2, messageText: footer });
  }
  const ctxInfo = buildRichContextInfo(quoted);
  return {
    message: buildBotForwardedMessage(submessages, ctxInfo),
    messageId: Utils_1.generateMessageID(),
  };
};

const generateListContent = (title, items, quoted, options = {}) => {
  const { footer, headerText } = options;
  const tableRows = items.map((item) => ({
    items: Array.isArray(item) ? item.map(String) : [String(item)],
  }));
  const submessages = [];
  if (headerText) {
    submessages.push({ messageType: 2, messageText: headerText });
  }
  submessages.push({
    messageType: 4,
    tableMetadata: { title, rows: tableRows },
  });
  if (footer) {
    submessages.push({ messageType: 2, messageText: footer });
  }
  const ctxInfo = buildRichContextInfo(quoted);
  return {
    message: buildBotForwardedMessage(submessages, ctxInfo),
    messageId: Utils_1.generateMessageID(),
  };
};

const generateCodeBlockContent = (code, quoted, options = {}) => {
  const { title, footer, language = "javascript" } = options;
  const submessages = [];
  if (title) {
    submessages.push({ messageType: 2, messageText: title });
  }
  submessages.push({
    messageType: 5,
    codeMetadata: {
      codeLanguage: language,
      codeBlocks: tokenizeCode(code, language),
    },
  });
  if (footer) {
    submessages.push({ messageType: 2, messageText: footer });
  }
  const ctxInfo = buildRichContextInfo(quoted);
  return {
    message: buildBotForwardedMessage(submessages, ctxInfo),
    messageId: Utils_1.generateMessageID(),
  };
};

const generateLatexContent = (quoted, options) => {
  const { text, expressions, headerText, footer } = options;
  const submessages = [];
  if (headerText) {
    submessages.push({ messageType: 2, messageText: headerText });
  }
  const latexExpressions = expressions.map((expr) => {
    const entry = {
      latexExpression: expr.latexExpression,
      url: expr.url,
      width: expr.width,
      height: expr.height,
    };
    if (expr.fontHeight !== undefined) entry.fontHeight = expr.fontHeight;
    if (expr.imageTopPadding !== undefined) entry.imageTopPadding = expr.imageTopPadding;
    if (expr.imageLeadingPadding !== undefined) entry.imageLeadingPadding = expr.imageLeadingPadding;
    if (expr.imageBottomPadding !== undefined) entry.imageBottomPadding = expr.imageBottomPadding;
    if (expr.imageTrailingPadding !== undefined) entry.imageTrailingPadding = expr.imageTrailingPadding;
    return entry;
  });
  submessages.push({
    messageType: 8,
    latexMetadata: {
      text: text || "",
      expressions: latexExpressions,
    },
  });
  if (footer) {
    submessages.push({ messageType: 2, messageText: footer });
  }
  const ctxInfo = buildRichContextInfo(quoted);
  return {
    message: buildBotForwardedMessage(submessages, ctxInfo),
    messageId: Utils_1.generateMessageID(),
  };
};

const generateLatexImageContent = async (quoted, options, uploadFn, renderLatexToPng) => {
  const { text, expressions, headerText, footer } = options;
  const submessages = [];
  if (headerText) {
    submessages.push({ messageType: 2, messageText: headerText });
  }
  const latexExpressions = await Promise.all(
    expressions.map(async (expr) => {
      const { buffer, width, height } = await renderLatexToPng(expr.latexExpression);
      const uploadResult = await uploadFn(buffer, "image");
      const imageUrl = uploadResult.url || uploadResult.directPath;
      return {
        latexExpression: expr.latexExpression,
        url: imageUrl,
        width,
        height,
      };
    }),
  );
  submessages.push({
    messageType: 8,
    latexMetadata: {
      text: text || "",
      expressions: latexExpressions,
    },
  });
  if (footer) {
    submessages.push({ messageType: 2, messageText: footer });
  }
  const ctxInfo = buildRichContextInfo(quoted);
  return {
    message: buildBotForwardedMessage(submessages, ctxInfo),
    messageId: Utils_1.generateMessageID(),
  };
};

const generateLatexInlineImageContent = async (quoted, options, uploadFn, renderLatexToPng) => {
  const { text, expressions, headerText, footer } = options;
  const submessages = [];
  if (headerText) {
    submessages.push({ messageType: 2, messageText: headerText });
  }
  if (text) {
    submessages.push({ messageType: 2, messageText: text });
  }
  for (const expr of expressions) {
    const { buffer, width, height } = await renderLatexToPng(expr.latexExpression);
    const uploadResult = await uploadFn(buffer, "image");
    const imageUrl = uploadResult.url || uploadResult.directPath;
    submessages.push({
      messageType: 3,
      imageMetadata: buildImageMetadata(imageUrl, expr.latexExpression, 2),
    });
  }
  if (footer) {
    submessages.push({ messageType: 2, messageText: footer });
  }
  const ctxInfo = buildRichContextInfo(quoted);
  return {
    message: buildBotForwardedMessage(submessages, ctxInfo),
    messageId: Utils_1.generateMessageID(),
  };
};

const captureUnifiedResponse = (msg) => {
  const botFwd = msg?.botForwardedMessage?.message;
  if (!botFwd) return null;
  const rich = botFwd.richResponseMessage;
  if (!rich?.unifiedResponse?.data) return null;
  return {
    unifiedResponse: { data: rich.unifiedResponse.data },
    submessages: rich.submessages || [],
    contextInfo: rich.contextInfo || {},
  };
};

const generateUnifiedResponseContent = (quoted, captured) => {
  const ctxInfo = buildRichContextInfo(quoted);
  return {
    message: buildBotForwardedMessage(
      captured.submessages,
      ctxInfo,
      captured.unifiedResponse,
    ),
    messageId: Utils_1.generateMessageID(),
  };
};

const generateRichMessageContent = (submessages = [], quoted) => {
  const safeSubmessages = Array.isArray(submessages)
    ? submessages.map((sm) => {
        if (sm && sm.messageType === 3 && sm.imageMetadata) {
          const md = sm.imageMetadata;
          if (typeof md.imageUrl === "string") {
            return {
              ...sm,
              imageMetadata: buildImageMetadata(
                md.imageUrl,
                md.imageText || "",
                md.alignment || 2,
              ),
            };
          }
          return sm;
        }
        return sm;
      })
    : [];
  const ctxInfo = buildRichContextInfo(quoted);
  return {
    message: buildBotForwardedMessage(safeSubmessages, ctxInfo),
    messageId: Utils_1.generateMessageID(),
  };
};

const HIGHLIGHT_TYPE_MAP = {
  0: "DEFAULT",
  1: "KEYWORD",
  2: "METHOD",
  3: "STR",
  4: "NUMBER",
  5: "COMMENT",
};

const tokenizeCodeV2 = (code, language = "javascript") => {
  const keywords = LANGUAGE_KEYWORDS[language] || JS_KEYWORDS;
  const tokens = [];
  let i = 0;
  const n = code.length;
  const push = (codeContent, highlightType) => {
    if (!codeContent) return;
    const last = tokens[tokens.length - 1];
    if (last && last.highlightType === highlightType) {
      last.codeContent += codeContent;
    } else {
      tokens.push({ codeContent, highlightType });
    }
  };
  const isWordStart = (c) => /[a-zA-Z_$]/.test(c);
  const isWord = (c) => /[a-zA-Z0-9_$]/.test(c);
  const isNum = (c) => /[0-9]/.test(c);
  while (i < n) {
    const c = code[i];
    if (c === "\n" || c === "\t" || c === " " || /\s/.test(c)) {
      let s = i;
      while (i < n && /\s/.test(code[i])) i++;
      push(code.slice(s, i), 0);
      continue;
    }
    if (c === "/" && code[i + 1] === "/") {
      let s = i; i += 2;
      while (i < n && code[i] !== "\n") i++;
      push(code.slice(s, i), 5);
      continue;
    }
    if (c === "/" && code[i + 1] === "*") {
      let s = i; i += 2;
      while (i < n - 1 && !(code[i] === "*" && code[i + 1] === "/")) i++;
      i += 2;
      push(code.slice(s, i), 5);
      continue;
    }
    if (c === "#" && (language === "python" || language === "py" || language === "bash" || language === "sh" || language === "shell" || language === "lua")) {
      let s = i; i++;
      while (i < n && code[i] !== "\n") i++;
      push(code.slice(s, i), 5);
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      let s = i; const q = c; i++;
      while (i < n) {
        if (code[i] === "\\" && i + 1 < n) { i += 2; }
        else if (code[i] === q) { i++; break; }
        else i++;
      }
      push(code.slice(s, i), 3);
      continue;
    }
    if (isNum(c)) {
      let s = i;
      while (i < n && /[0-9.xXa-fA-FeEbBoO_]/.test(code[i])) i++;
      push(code.slice(s, i), 4);
      continue;
    }
    if (isWordStart(c)) {
      let s = i;
      while (i < n && isWord(code[i])) i++;
      const word = code.slice(s, i);
      let type = 0;
      if (keywords.has(word)) {
        type = 1;
      } else {
        let j = i;
        while (j < n && /\s/.test(code[j])) j++;
        if (code[j] === "(") type = 2;
      }
      push(word, type);
      continue;
    }
    push(c, 0);
    i++;
  }
  return {
    codeBlock: tokens,
    unified_codeBlock: tokens.map((t) => ({
      content: t.codeContent,
      type: HIGHLIGHT_TYPE_MAP[t.highlightType] || "DEFAULT",
    })),
  };
};

const toTableMetadataV2 = (arr) => {
  const safeArr = Array.isArray(arr) ? arr : [];
  if (safeArr.length === 0) {
    throw new Error("Input must be a non-empty array");
  }
  const [title, headerStr, ...rest] = safeArr;
  const splitCols = (str) => {
    if (typeof str !== "string") return [];
    return str.includes("|")
      ? str.split("|").map((s) => s.trim())
      : str.split(",").map((s) => s.trim());
  };
  const splitRows = (str) => {
    if (typeof str !== "string") return [];
    return str.split(";;").map((row) => splitCols(row));
  };
  const header = splitCols(headerStr);
  const parsedRows = rest.flatMap(splitRows);
  const maxLen = Math.max(header.length, ...parsedRows.map((r) => r.length));
  const unified_rows = [
    {
      is_header: true,
      cells: [...header, ...Array(maxLen - header.length).fill("")],
    },
    ...parsedRows.map((cells) => ({
      is_header: false,
      cells: [...cells, ...Array(maxLen - cells.length).fill("")],
    })),
  ];
  const rows = unified_rows.map((r) => ({
    items: r.cells,
    ...(r.is_header ? { isHeading: true } : {}),
  }));
  return { title, rows, unified_rows };
};

const generateTableContentV2 = (table, quoted, options = {}) => {
  const { title, footer, headerText, text } = options;
  const { unified_rows } = toTableMetadataV2(table);
  const sections = [];
  if (headerText || title) {
    const headingText = headerText || title;
    sections.push({
      view_model: {
        primitive: { text: headingText, __typename: "GenAIMarkdownTextUXPrimitive" },
        __typename: "GenAISingleLayoutViewModel",
      },
    });
  }
  if (text) {
    sections.push({
      view_model: {
        primitive: { text, __typename: "GenAIMarkdownTextUXPrimitive" },
        __typename: "GenAISingleLayoutViewModel",
      },
    });
  }
  sections.push({
    view_model: {
      primitive: { rows: unified_rows, __typename: "GenATableUXPrimitive" },
      __typename: "GenAISingleLayoutViewModel",
    },
  });
  if (footer) {
    sections.push({
      view_model: {
        primitive: { text: footer, __typename: "GenAIMarkdownTextUXPrimitive" },
        __typename: "GenAISingleLayoutViewModel",
      },
    });
  }
  const responseId = _crypto.randomUUID();
  const unifiedData = { response_id: responseId, sections };
  const base64Data = Buffer.from(JSON.stringify(unifiedData)).toString("base64");
  const ctxInfo = {
    forwardingScore: 2,
    isForwarded: true,
    forwardedAiBotMessageInfo: { botJid: "259786046210223@bot" },
    forwardOrigin: 4,
    botMessageSharingInfo: { botEntryPointOrigin: 1, forwardScore: 2 },
  };
  if (quoted?.key) {
    ctxInfo.stanzaId = quoted.key.id;
    ctxInfo.participant = quoted.key.participant || quoted.sender || quoted.key.remoteJid;
    ctxInfo.quotedMessage = quoted.message;
  }
  const content = {
    messageContextInfo: {
      messageSecret: _crypto.randomBytes(32),
    },
    botForwardedMessage: {
      message: {
        richResponseMessage: {
          submessages: [],
          messageType: 1,
          unifiedResponse: { data: base64Data },
          contextInfo: ctxInfo,
        },
      },
    },
  };
  return { message: content, messageId: Utils_1.generateMessageID() };
};

const generateCodeBlockContentV2 = (code, quoted, options = {}) => {
  const { title, footer, language = "javascript", text } = options;
  const { unified_codeBlock } = tokenizeCodeV2(code, language);
  const sections = [];
  if (text) {
    sections.push({
      view_model: {
        primitive: { text, __typename: "GenAIMarkdownTextUXPrimitive" },
        __typename: "GenAISingleLayoutViewModel",
      },
    });
  }
  sections.push({
    view_model: {
      primitive: { language, code_blocks: unified_codeBlock, __typename: "GenAICodeUXPrimitive" },
      __typename: "GenAISingleLayoutViewModel",
    },
  });
  if (footer) {
    sections.push({
      view_model: {
        primitive: { text: footer, __typename: "GenAIMarkdownTextUXPrimitive" },
        __typename: "GenAISingleLayoutViewModel",
      },
    });
  }
  const responseId = _crypto.randomUUID();
  const unifiedData = { response_id: responseId, sections };
  const base64Data = Buffer.from(JSON.stringify(unifiedData)).toString("base64");
  const ctxInfo = {
    forwardingScore: 2,
    isForwarded: true,
    forwardedAiBotMessageInfo: { botJid: "259786046210223@bot" },
    forwardOrigin: 4,
    botMessageSharingInfo: { botEntryPointOrigin: 1, forwardScore: 2 },
  };
  if (quoted?.key) {
    ctxInfo.stanzaId = quoted.key.id;
    ctxInfo.participant = quoted.key.participant || quoted.sender || quoted.key.remoteJid;
    ctxInfo.quotedMessage = quoted.message;
  }
  const content = {
    messageContextInfo: {
      messageSecret: _crypto.randomBytes(32),
    },
    botForwardedMessage: {
      message: {
        richResponseMessage: {
          submessages: [],
          messageType: 1,
          unifiedResponse: { data: base64Data },
          contextInfo: ctxInfo,
        },
      },
    },
  };
  return { message: content, messageId: Utils_1.generateMessageID() };
};

const generateLinkContent = (text, links, quoted, options = {}) => {
  const { footer, botJid = "867051314767696@bot", forwardingScore = 3, citations = [], proofs = [] } = options;
  const submessages = [];
  const fullText = footer ? `${text}${footer}` : text;
  submessages.push({ messageType: 2, messageText: fullText });
  const sections = [];
  const inlineEntities = links.map((link, i) => {
    const url = typeof link === "string" ? link : link.url;
    const displayName = typeof link === "object" && link.displayName ? link.displayName : citations[i]?.sourceTitle || `Link ${i + 1}`;
    return {
      key: `IE_${i}`,
      metadata: { display_name: displayName, is_trusted: false, url, __typename: "GenAIInlineLinkItem" },
    };
  });
  sections.push({
    view_model: {
      primitive: { text, inline_entities: inlineEntities, __typename: "GenAIMarkdownTextUXPrimitive" },
      __typename: "GenAISingleLayoutViewModel",
    },
  });
  if (footer) {
    sections.push({
      view_model: {
        primitive: { text: footer, __typename: "GenAIMarkdownTextUXPrimitive" },
        __typename: "GenAISingleLayoutViewModel",
      },
    });
  }
  const responseId = _crypto.randomUUID();
  const unifiedData = { response_id: responseId, sections };
  const base64Data = Buffer.from(JSON.stringify(unifiedData)).toString("base64");
  const ctxInfo = {
    forwardingScore,
    isForwarded: true,
    forwardedAiBotMessageInfo: { botJid },
    forwardOrigin: 4,
    botMessageSharingInfo: { forwardScore: forwardingScore },
  };
  if (quoted?.key) {
    ctxInfo.stanzaId = quoted.key.id;
    ctxInfo.participant = quoted.key.participant || quoted.sender || quoted.key.remoteJid;
    ctxInfo.quotedMessage = quoted.message;
  }
  const messageContextInfo = { messageSecret: _crypto.randomBytes(32) };
  if (citations.length > 0 || proofs.length > 0) {
    const botMetadata = {};
    if (citations.length > 0) {
      botMetadata.richResponseSourcesMetadata = {
        sources: citations.map((c, i) => ({
          provider: 1,
          thumbnailCdnUrl: "",
          sourceProviderUrl: typeof links[i] === "string" ? links[i] : links[i]?.url || "",
          sourceQuery: c.sourceQuery || "",
          faviconCdnUrl: c.faviconCdnUrl || "",
          citationNumber: c.citationNumber ?? i + 1,
          sourceTitle: c.sourceTitle || "",
        })),
      };
    }
    if (proofs.length > 0) {
      botMetadata.verificationMetadata = {
        proofs: proofs.map((p) => ({
          version: p.version || 1,
          useCase: p.useCase || 1,
          signature: p.signature || "",
          certificateChain: p.certificateChain || [],
        })),
      };
    }
    messageContextInfo.botMetadata = botMetadata;
  }
  const content = {
    messageContextInfo,
    botForwardedMessage: {
      message: {
        richResponseMessage: {
          messageType: 1,
          submessages,
          unifiedResponse: { data: base64Data },
          contextInfo: ctxInfo,
        },
      },
    },
  };
  return { message: content, messageId: Utils_1.generateMessageID() };
};

const generateLinkContentV2 = (text, links, quoted, options = {}) => {
  const { footer, searchEngine = "MAME" } = options;
  const submessages = [];
  const fullText = footer ? `${text}${footer}` : text;
  submessages.push({ messageType: 2, messageText: fullText });
  const sections = [];
  const inlineEntities = links.map((link, i) => {
    const url = typeof link === "string" ? link : link.url;
    const displayName = typeof link === "object" && link.displayName ? link.displayName : `Link ${i + 1}`;
    const sourceDisplayName = typeof link === "object" && link.sourceDisplayName ? link.sourceDisplayName : `Source ${i + 1}`;
    const sourceSubtitle = typeof link === "object" && link.sourceSubtitle ? link.sourceSubtitle : "";
    return {
      key: `IE_${i}`,
      metadata: {
        reference_id: i + 1, reference_url: url, reference_title: displayName, reference_display_name: displayName,
        sources: [{ source_type: "THIRD_PARTY", source_display_name: sourceDisplayName, source_subtitle: sourceSubtitle, source_url: url }],
        __typename: "GenAISearchCitationItem",
      },
    };
  });
  sections.push({
    view_model: {
      primitive: { text, inline_entities: inlineEntities, __typename: "GenAIMarkdownTextUXPrimitive" },
      __typename: "GenAISingleLayoutViewModel",
    },
  });
  const searchSources = links.map((link, i) => {
    const url = typeof link === "string" ? link : link.url;
    const sourceDisplayName = typeof link === "object" && link.sourceDisplayName ? link.sourceDisplayName : `Source ${i + 1}`;
    const sourceSubtitle = typeof link === "object" && link.sourceSubtitle ? link.sourceSubtitle : "";
    return { source_type: "THIRD_PARTY", source_display_name: sourceDisplayName, source_subtitle: sourceSubtitle, source_url: url };
  });
  sections.push({
    view_model: {
      primitive: { sources: searchSources, search_engine: searchEngine, __typename: "GenAISearchResultPrimitive" },
      __typename: "GenAISingleLayoutViewModel",
    },
  });
  if (footer) {
    sections.push({
      view_model: {
        primitive: { text: footer, __typename: "GenAIMarkdownTextUXPrimitive" },
        __typename: "GenAISingleLayoutViewModel",
      },
    });
  }
  const responseId = _crypto.randomUUID();
  const unifiedData = { response_id: responseId, sections };
  const base64Data = Buffer.from(JSON.stringify(unifiedData)).toString("base64");
  const ctxInfo = { isForwarded: true, forwardOrigin: 4 };
  if (quoted?.key) {
    ctxInfo.participant = quoted.key.participant || quoted.sender || quoted.key.remoteJid;
    ctxInfo.quotedMessage = quoted.message;
  }
  const content = {
    messageContextInfo: { messageSecret: _crypto.randomBytes(32) },
    botForwardedMessage: {
      message: {
        richResponseMessage: {
          messageType: 1,
          submessages,
          unifiedResponse: { data: base64Data },
          contextInfo: ctxInfo,
        },
      },
    },
  };
  return { message: content, messageId: Utils_1.generateMessageID() };
};

const generateImageContent = (imageUrl, quoted, options = {}) => {
  const { imageText = "", alignment = 2, headerText, footer } = options;
  const submessages = [];
  if (headerText) {
    submessages.push({ messageType: 2, messageText: headerText });
  }
  submessages.push({
    messageType: 3,
    imageMetadata: buildImageMetadata(imageUrl, imageText, alignment),
  });
  if (footer) {
    submessages.push({ messageType: 2, messageText: footer });
  }
  const ctxInfo = buildRichContextInfo(quoted);
  return {
    message: buildBotForwardedMessage(submessages, ctxInfo),
    messageId: Utils_1.generateMessageID(),
  };
};

const processImageWithSharp = async (inputBuffer, options = {}) => {
  const {
    width,
    height,
    fit = "cover",
    format = "jpeg",
    quality = 80,
    grayscale = false,
    blur = 0,
    rotate = 0,
  } = options;

  let pipeline = _sharp(inputBuffer);

  if (rotate) {
    pipeline = pipeline.rotate(rotate);
  }
  if (width || height) {
    pipeline = pipeline.resize(width, height, { fit });
  }
  if (grayscale) {
    pipeline = pipeline.grayscale();
  }
  if (blur > 0) {
    pipeline = pipeline.blur(blur);
  }

  switch (format) {
    case "png":
      pipeline = pipeline.png({ quality });
      break;
    case "webp":
      pipeline = pipeline.webp({ quality });
      break;
    case "avif":
      pipeline = pipeline.avif({ quality });
      break;
    case "gif":
      pipeline = pipeline.gif();
      break;
    default:
      pipeline = pipeline.jpeg({ quality });
      break;
  }

  const outputBuffer = await pipeline.toBuffer();
  const metadata = await _sharp(outputBuffer).metadata();

  return {
    buffer: outputBuffer,
    width: metadata.width,
    height: metadata.height,
    format: metadata.format,
    size: metadata.size,
  };
};

const getImageMetadata = async (inputBuffer) => {
  const metadata = await _sharp(inputBuffer).metadata();
  return {
    width: metadata.width,
    height: metadata.height,
    format: metadata.format,
    size: metadata.size,
    channels: metadata.channels,
    density: metadata.density,
    hasAlpha: metadata.hasAlpha,
    orientation: metadata.orientation,
    space: metadata.space,
  };
};

const createImageThumbnail = async (inputBuffer, size = 200) => {
  const outputBuffer = await _sharp(inputBuffer)
    .resize(size, size, { fit: "inside" })
    .jpeg({ quality: 70 })
    .toBuffer();
  return outputBuffer;
};

const streamToBuffer = (stream) => {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
};

const bufferToReadableStream = (buffer) => {
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);
  return stream;
};

const createPassThroughStream = () => {
  return new PassThrough();
};

const extractAudioFromVideo = (inputPath, outputPath, options = {}) => {
  const {
    format = "mp3",
    bitrate = "128k",
    channels = 2,
    sampleRate = 44100,
  } = options;

  return new Promise((resolve, reject) => {
    _ffmpeg(inputPath)
      .noVideo()
      .audioCodec(format === "mp3" ? "libmp3lame" : format === "aac" ? "aac" : "copy")
      .audioBitrate(bitrate)
      .audioChannels(channels)
      .audioFrequency(sampleRate)
      .format(format)
      .on("end", () => resolve(outputPath))
      .on("error", (err) => reject(err))
      .save(outputPath);
  });
};

const extractVideoMetadata = (inputPath) => {
  return new Promise((resolve, reject) => {
    _ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) return reject(err);
      const videoStream = metadata.streams.find((s) => s.codec_type === "video");
      const audioStream = metadata.streams.find((s) => s.codec_type === "audio");
      resolve({
        duration: metadata.format.duration,
        size: metadata.format.size,
        bitrate: metadata.format.bit_rate,
        formatName: metadata.format.format_name,
        video: videoStream
          ? {
              codec: videoStream.codec_name,
              width: videoStream.width,
              height: videoStream.height,
              fps: videoStream.r_frame_rate,
              bitrate: videoStream.bit_rate,
            }
          : null,
        audio: audioStream
          ? {
              codec: audioStream.codec_name,
              channels: audioStream.channels,
              sampleRate: audioStream.sample_rate,
              bitrate: audioStream.bit_rate,
            }
          : null,
      });
    });
  });
};

const convertVideo = (inputPath, outputPath, options = {}) => {
  const {
    format = "mp4",
    videoCodec = "libx264",
    audioCodec = "aac",
    videoBitrate = "1000k",
    audioBitrate = "128k",
    width,
    height,
    fps = 30,
    preset = "medium",
  } = options;

  return new Promise((resolve, reject) => {
    let command = _ffmpeg(inputPath)
      .videoCodec(videoCodec)
      .audioCodec(audioCodec)
      .videoBitrate(videoBitrate)
      .audioBitrate(audioBitrate)
      .fps(fps)
      .format(format);

    if (width && height) {
      command = command.size(`${width}x${height}`);
    }
    if (preset) {
      command = command.outputOptions([`-preset ${preset}`]);
    }

    command
      .on("end", () => resolve(outputPath))
      .on("error", (err) => reject(err))
      .save(outputPath);
  });
};

const generateVideoThumbnail = (inputPath, outputPath, timestamp = "00:00:01") => {
  return new Promise((resolve, reject) => {
    _ffmpeg(inputPath)
      .screenshots({
        timestamps: [timestamp],
        filename: outputPath.split("/").pop(),
        folder: outputPath.substring(0, outputPath.lastIndexOf("/")),
        size: "320x240",
      })
      .on("end", () => resolve(outputPath))
      .on("error", (err) => reject(err));
  });
};

const streamVideoToBuffer = (inputPath, options = {}) => {
  return new Promise((resolve, reject) => {
    const {
      format = "mp4",
      videoCodec = "libx264",
      audioCodec = "aac",
    } = options;

    const passThrough = new PassThrough();
    const chunks = [];

    passThrough.on("data", (chunk) => chunks.push(chunk));
    passThrough.on("end", () => resolve(Buffer.concat(chunks)));
    passThrough.on("error", reject);

    _ffmpeg(inputPath)
      .videoCodec(videoCodec)
      .audioCodec(audioCodec)
      .format(format)
      .pipe(passThrough, { end: true });
  });
};

const generateMediaContent = async (mediaBuffer, quoted, options = {}) => {
  const {
    mediaType = "image",
    headerText,
    footer,
    imageText = "",
    alignment = 2,
    processOptions = {},
  } = options;

  const submessages = [];
  if (headerText) {
    submessages.push({ messageType: 2, messageText: headerText });
  }

  let processedResult;
  if (mediaType === "image") {
    processedResult = await processImageWithSharp(mediaBuffer, processOptions);
  } else {
    processedResult = { buffer: mediaBuffer, format: "video" };
  }

  const uploadFn = options.uploadFn || (async (buf) => ({ url: "", directPath: "" }));
  const uploadResult = await uploadFn(processedResult.buffer, mediaType);
  const mediaUrl = uploadResult.url || uploadResult.directPath;

  if (mediaType === "image") {
    submessages.push({
      messageType: 3,
      imageMetadata: buildImageMetadata(mediaUrl, imageText, alignment),
    });
  } else {
    submessages.push({
      messageType: 6,
      dynamicMetadata: {
        mediaUrl,
        mediaType,
      },
    });
  }

  if (footer) {
    submessages.push({ messageType: 2, messageText: footer });
  }

  const ctxInfo = buildRichContextInfo(quoted);
  return {
    message: buildBotForwardedMessage(submessages, ctxInfo),
    messageId: Utils_1.generateMessageID(),
  };
};

module.exports = {
  JS_KEYWORDS,
  PYTHON_KEYWORDS,
  GO_KEYWORDS,
  LUA_KEYWORDS,
  BASH_KEYWORDS,
  LANGUAGE_KEYWORDS,
  CodeHighlightType,
  RichSubMessageType,
  tokenizeCode,
  buildRichContextInfo,
  buildBotForwardedMessage,
  buildImageMetadata,
  generateTableContent,
  generateListContent,
  generateCodeBlockContent,
  generateLatexContent,
  generateLatexImageContent,
  generateLatexInlineImageContent,
  captureUnifiedResponse,
  generateUnifiedResponseContent,
  generateRichMessageContent,
  tokenizeCodeV2,
  toTableMetadataV2,
  generateTableContentV2,
  generateCodeBlockContentV2,
  generateLinkContent,
  generateLinkContentV2,
  generateImageContent,
  processImageWithSharp,
  getImageMetadata,
  createImageThumbnail,
  streamToBuffer,
  bufferToReadableStream,
  createPassThroughStream,
  extractAudioFromVideo,
  extractVideoMetadata,
  convertVideo,
  generateVideoThumbnail,
  streamVideoToBuffer,
  generateMediaContent,
};