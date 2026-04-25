import { createHighlighterCore } from "shiki/core";
import { createOnigurumaEngine } from "shiki/engine/oniguruma";
import bash from "shiki/langs/bash.mjs";
import c from "shiki/langs/c.mjs";
import cpp from "shiki/langs/cpp.mjs";
import csharp from "shiki/langs/csharp.mjs";
import css from "shiki/langs/css.mjs";
import dart from "shiki/langs/dart.mjs";
import go from "shiki/langs/go.mjs";
import html from "shiki/langs/html.mjs";
import java from "shiki/langs/java.mjs";
import javascript from "shiki/langs/javascript.mjs";
import json from "shiki/langs/json.mjs";
import jsonc from "shiki/langs/jsonc.mjs";
import jsx from "shiki/langs/jsx.mjs";
import kotlin from "shiki/langs/kotlin.mjs";
import lua from "shiki/langs/lua.mjs";
import markdown from "shiki/langs/markdown.mjs";
import php from "shiki/langs/php.mjs";
import python from "shiki/langs/python.mjs";
import r from "shiki/langs/r.mjs";
import ruby from "shiki/langs/ruby.mjs";
import rust from "shiki/langs/rust.mjs";
import scala from "shiki/langs/scala.mjs";
import shellscript from "shiki/langs/shellscript.mjs";
import solidity from "shiki/langs/solidity.mjs";
import swift from "shiki/langs/swift.mjs";
import toml from "shiki/langs/toml.mjs";
import tsx from "shiki/langs/tsx.mjs";
import typescript from "shiki/langs/typescript.mjs";
import vue from "shiki/langs/vue.mjs";
import xml from "shiki/langs/xml.mjs";
import yaml from "shiki/langs/yaml.mjs";
import githubDark from "shiki/themes/github-dark.mjs";
import githubLight from "shiki/themes/github-light.mjs";
import wasm from "shiki/wasm";

export type SyntaxKind =
  | "builtin"
  | "comment"
  | "function"
  | "key"
  | "keyword"
  | "literal"
  | "number"
  | "operator"
  | "punctuation"
  | "string"
  | "type";

export interface SyntaxToken {
  text: string;
  kind?: SyntaxKind;
  style?: {
    color?: string;
    fontStyle?: string;
    fontWeight?: string;
    textDecoration?: string;
  };
}

type Language =
  | "c"
  | "cpp"
  | "css"
  | "json"
  | "markdown"
  | "markup"
  | "python"
  | "rust"
  | "shell"
  | "solidity"
  | "toml"
  | "typescript"
  | "yaml"
  | "plain";

interface CodeLikeConfig {
  keywords: Set<string>;
  types: Set<string>;
  builtins: Set<string>;
  literals: Set<string>;
}

const maxCacheEntries = 12000;
const tokenCache = new Map<string, SyntaxToken[]>();
type ShikiHighlighter = Awaited<ReturnType<typeof createHighlighterCore>>;

const shikiThemes = ["github-dark", "github-light"];
const shikiLanguages = [
  "bash",
  "c",
  "cpp",
  "csharp",
  "css",
  "dart",
  "go",
  "html",
  "java",
  "javascript",
  "json",
  "jsonc",
  "jsx",
  "kotlin",
  "lua",
  "markdown",
  "php",
  "python",
  "r",
  "ruby",
  "rust",
  "scala",
  "shellscript",
  "solidity",
  "swift",
  "toml",
  "tsx",
  "typescript",
  "vue",
  "xml",
  "yaml",
] as const;

type ShikiLanguage = (typeof shikiLanguages)[number];

let highlighterPromise: Promise<ShikiHighlighter> | null = null;
const shikiLanguageInputs = [
  bash,
  c,
  cpp,
  csharp,
  css,
  dart,
  go,
  html,
  java,
  javascript,
  json,
  jsonc,
  jsx,
  kotlin,
  lua,
  markdown,
  php,
  python,
  r,
  ruby,
  rust,
  scala,
  shellscript,
  solidity,
  swift,
  toml,
  tsx,
  typescript,
  vue,
  xml,
  yaml,
];

const solidityConfig: CodeLikeConfig = {
  keywords: words(
    "abstract after alias anonymous apply as assembly break case catch constant constructor continue contract default delete do else emit enum error event external fallback for from function global if immutable import indexed interface internal is leave let library mapping memory modifier new override payable pragma private public pure receive return returns revert storage struct switch transient try unchecked using view virtual while",
  ),
  types: words(
    "address bool byte bytes bytes1 bytes2 bytes3 bytes4 bytes5 bytes6 bytes7 bytes8 bytes9 bytes10 bytes11 bytes12 bytes13 bytes14 bytes15 bytes16 bytes17 bytes18 bytes19 bytes20 bytes21 bytes22 bytes23 bytes24 bytes25 bytes26 bytes27 bytes28 bytes29 bytes30 bytes31 bytes32 fixed int int8 int16 int24 int32 int40 int48 int56 int64 int72 int80 int88 int96 int104 int112 int120 int128 int136 int144 int152 int160 int168 int176 int184 int192 int200 int208 int216 int224 int232 int240 int248 int256 string ufixed uint uint8 uint16 uint24 uint32 uint40 uint48 uint56 uint64 uint72 uint80 uint88 uint96 uint104 uint112 uint120 uint128 uint136 uint144 uint152 uint160 uint168 uint176 uint184 uint192 uint200 uint208 uint216 uint224 uint232 uint240 uint248 uint256 var",
  ),
  builtins: words(
    "abi addmod assert balance block blobhash blobbasefee call callcode chainid coinbase datahash delegatecall difficulty ecrecover encode encodeCall encodePacked encodeWithSelector encodeWithSignature gas gasleft keccak256 log0 log1 log2 log3 log4 msg mulmod number origin payable prevrandao ripemd160 selfbalance selfdestruct sender send sha256 sig staticcall timestamp transfer tx value",
  ),
  literals: words(
    "false hex null true wei gwei ether seconds minutes hours days weeks years",
  ),
};

const typescriptConfig: CodeLikeConfig = {
  keywords: words(
    "abstract as async await break case catch class const constructor continue debugger declare default delete do else enum export extends finally for from function get if implements import in infer instanceof interface is keyof let module namespace new of package private protected public readonly require return satisfies set static super switch this throw try type typeof var void while with yield",
  ),
  types: words(
    "any bigint boolean never null number object string symbol undefined unknown void Array Date Error Map Promise Record RegExp Set WeakMap WeakSet",
  ),
  builtins: words(
    "Array Boolean console Date Error JSON Math Number Object Promise Reflect RegExp String Symbol parseFloat parseInt",
  ),
  literals: words("false NaN null true undefined"),
};

const rustConfig: CodeLikeConfig = {
  keywords: words(
    "as async await become box break const continue crate do dyn else enum extern false final fn for if impl in let loop macro match mod move mut override priv pub ref return self Self static struct super trait true try type typeof unsafe unsized use virtual where while yield",
  ),
  types: words(
    "bool char f32 f64 i8 i16 i32 i64 i128 isize str u8 u16 u32 u64 u128 usize Option Result String Vec Box HashMap HashSet",
  ),
  builtins: words(
    "assert assert_eq assert_ne cfg dbg drop eprintln format matches panic println todo unreachable vec",
  ),
  literals: words("false None Some true"),
};

const cConfig: CodeLikeConfig = {
  keywords: words(
    "auto break case const continue default do else enum extern for goto if inline register restrict return signed sizeof static struct switch typedef union unsigned volatile while",
  ),
  types: words(
    "bool char double float int long short size_t ssize_t uint8_t uint16_t uint32_t uint64_t int8_t int16_t int32_t int64_t void",
  ),
  builtins: words(
    "free malloc calloc realloc memcmp memcpy memmove memset printf snprintf sprintf fprintf puts strlen strcmp strncmp",
  ),
  literals: words("false NULL true"),
};

const cppConfig: CodeLikeConfig = {
  keywords: words(
    "alignas alignof and asm auto bitand bitor break case catch class compl concept const consteval constexpr constinit const_cast continue co_await co_return co_yield decltype default delete do dynamic_cast else enum explicit export extern for friend goto if import inline mutable namespace new noexcept not operator or private protected public register reinterpret_cast requires return sizeof static static_assert static_cast struct switch template this thread_local throw try typedef typeid typename union using virtual volatile while xor",
  ),
  types: words(
    "auto bool char char8_t char16_t char32_t double float int long short size_t ssize_t std string uint8_t uint16_t uint32_t uint64_t int8_t int16_t int32_t int64_t void wchar_t",
  ),
  builtins: words(
    "cerr cin cout endl make_shared make_unique move printf size_t static_cast std",
  ),
  literals: words("false nullptr NULL true"),
};

const pythonConfig: CodeLikeConfig = {
  keywords: words(
    "and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield",
  ),
  types: words(
    "bool bytes dict float frozenset int list object set str tuple type",
  ),
  builtins: words(
    "abs all any bool bytes callable dict dir enumerate filter float hasattr int isinstance len list map max min object open print range repr reversed round set sorted str sum super tuple type zip",
  ),
  literals: words("False None True"),
};

const cssKeywords = words(
  "and from important in media not only or supports to var",
);

export function highlightSourceLine(
  text: string,
  filePath: string,
): SyntaxToken[] {
  if (!text) return [{ text: " " }];
  const language = detectLanguage(filePath);
  const cacheKey = `${language}\u0000${text}`;
  const cached = tokenCache.get(cacheKey);
  if (cached) return cached;

  const tokens = highlightByLanguage(text, language);
  tokenCache.set(cacheKey, tokens);
  if (tokenCache.size > maxCacheEntries) tokenCache.clear();
  return tokens;
}

export async function highlightSourceLines(
  lines: string[],
  filePath: string,
  theme: "light" | "dark",
): Promise<SyntaxToken[][]> {
  const language = detectShikiLanguage(filePath);
  if (!language)
    return lines.map((line) => highlightSourceLine(line, filePath));

  try {
    const highlighter = await getHighlighter();
    const result = highlighter.codeToTokens(lines.join("\n"), {
      lang: language,
      theme: theme === "dark" ? "github-dark" : "github-light",
    });
    return lines.map((line, index) => {
      const row = result.tokens[index] ?? [];
      return row.length > 0
        ? row.map(shikiTokenToSyntaxToken)
        : highlightSourceLine(line, filePath);
    });
  } catch {
    return lines.map((line) => highlightSourceLine(line, filePath));
  }
}

function getHighlighter(): Promise<ShikiHighlighter> {
  highlighterPromise ??= createHighlighterCore({
    themes: [githubDark, githubLight],
    langs: shikiLanguageInputs,
    engine: createOnigurumaEngine(wasm),
  });
  return highlighterPromise;
}

function shikiTokenToSyntaxToken(token: {
  content: string;
  color?: string;
  fontStyle?: number;
}): SyntaxToken {
  const style: SyntaxToken["style"] = {};
  if (token.color) style.color = token.color;
  if ((token.fontStyle ?? 0) & 1) style.fontStyle = "italic";
  if ((token.fontStyle ?? 0) & 2) style.fontWeight = "600";
  if ((token.fontStyle ?? 0) & 4) style.textDecoration = "underline";
  return Object.keys(style).length > 0
    ? { text: token.content, style }
    : { text: token.content };
}

function highlightByLanguage(text: string, language: Language): SyntaxToken[] {
  switch (language) {
    case "c":
      return highlightCodeLike(text, cConfig);
    case "cpp":
      return highlightCodeLike(text, cppConfig);
    case "solidity":
      return highlightCodeLike(text, solidityConfig);
    case "typescript":
      return highlightCodeLike(text, typescriptConfig);
    case "rust":
      return highlightCodeLike(text, rustConfig);
    case "python":
      return highlightPython(text);
    case "json":
      return highlightJson(text);
    case "toml":
    case "yaml":
      return highlightConfig(text, language);
    case "shell":
      return highlightShell(text);
    case "markdown":
      return highlightMarkdown(text);
    case "css":
      return highlightCss(text);
    case "markup":
      return highlightMarkup(text);
    default:
      return [{ text }];
  }
}

function detectLanguage(filePath: string): Language {
  const lower = filePath.toLowerCase();
  const extension = lower.split(".").pop() ?? "";
  if (extension === "sol") return "solidity";
  if (["c", "h"].includes(extension)) return "c";
  if (["cc", "cpp", "cxx", "hh", "hpp", "hxx"].includes(extension))
    return "cpp";
  if (
    ["ts", "tsx", "js", "jsx", "mjs", "cjs", "mts", "cts"].includes(extension)
  )
    return "typescript";
  if (extension === "rs") return "rust";
  if (["py", "pyw"].includes(extension)) return "python";
  if (extension === "json" || lower.endsWith(".jsonc")) return "json";
  if (extension === "toml") return "toml";
  if (extension === "yaml" || extension === "yml") return "yaml";
  if (extension === "md" || extension === "mdx") return "markdown";
  if (["sh", "bash", "zsh"].includes(extension)) return "shell";
  if (extension === "css") return "css";
  if (["html", "htm", "xml", "svg"].includes(extension)) return "markup";
  return "plain";
}

function detectShikiLanguage(filePath: string): ShikiLanguage | null {
  const lower = filePath.toLowerCase();
  const extension = lower.split(".").pop() ?? "";
  if (extension === "sol") return "solidity";
  if (extension === "c" || extension === "h") return "c";
  if (["cc", "cpp", "cxx", "hh", "hpp", "hxx"].includes(extension))
    return "cpp";
  if (extension === "ts") return "typescript";
  if (extension === "tsx") return "tsx";
  if (["js", "mjs", "cjs"].includes(extension)) return "javascript";
  if (extension === "jsx") return "jsx";
  if (extension === "rs") return "rust";
  if (extension === "py" || extension === "pyw") return "python";
  if (extension === "go") return "go";
  if (extension === "java") return "java";
  if (extension === "cs") return "csharp";
  if (extension === "kt" || extension === "kts") return "kotlin";
  if (extension === "php") return "php";
  if (extension === "rb") return "ruby";
  if (extension === "swift") return "swift";
  if (extension === "scala" || extension === "sc") return "scala";
  if (extension === "dart") return "dart";
  if (extension === "lua") return "lua";
  if (extension === "r") return "r";
  if (extension === "json") return "json";
  if (lower.endsWith(".jsonc")) return "jsonc";
  if (extension === "toml") return "toml";
  if (extension === "yaml" || extension === "yml") return "yaml";
  if (extension === "md" || extension === "mdx") return "markdown";
  if (extension === "sh" || extension === "bash") return "bash";
  if (extension === "zsh") return "shellscript";
  if (extension === "css") return "css";
  if (extension === "html" || extension === "htm") return "html";
  if (extension === "xml" || extension === "svg") return "xml";
  if (extension === "vue") return "vue";
  return null;
}

function highlightCodeLike(
  text: string,
  config: CodeLikeConfig,
): SyntaxToken[] {
  const tokens: SyntaxToken[] = [];
  let index = 0;

  while (index < text.length) {
    const char = text[index] ?? "";
    const next = text[index + 1] ?? "";

    if (char === "/" && next === "/") {
      push(tokens, text.slice(index), "comment");
      break;
    }
    if (char === "/" && next === "*") {
      const end = text.indexOf("*/", index + 2);
      const stop = end === -1 ? text.length : end + 2;
      push(tokens, text.slice(index, stop), "comment");
      index = stop;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      const stop = readQuoted(text, index, char);
      push(tokens, text.slice(index, stop), "string");
      index = stop;
      continue;
    }
    if (isNumberStart(text, index)) {
      const stop = readNumber(text, index);
      push(tokens, text.slice(index, stop), "number");
      index = stop;
      continue;
    }
    if (isIdentifierStart(char)) {
      const stop = readIdentifier(text, index);
      const word = text.slice(index, stop);
      const nextNonSpace = findNextNonSpace(text, stop);
      if (config.keywords.has(word)) push(tokens, word, "keyword");
      else if (config.types.has(word)) push(tokens, word, "type");
      else if (config.literals.has(word)) push(tokens, word, "literal");
      else if (config.builtins.has(word)) push(tokens, word, "builtin");
      else if (nextNonSpace === "(") push(tokens, word, "function");
      else push(tokens, word);
      index = stop;
      continue;
    }
    if (isOperator(char)) push(tokens, char, "operator");
    else if (isPunctuation(char)) push(tokens, char, "punctuation");
    else push(tokens, char);
    index += 1;
  }

  return tokens;
}

function highlightJson(text: string): SyntaxToken[] {
  const tokens: SyntaxToken[] = [];
  let index = 0;
  while (index < text.length) {
    const char = text[index] ?? "";
    if (char === '"' || char === "'") {
      const stop = readQuoted(text, index, char);
      const quoted = text.slice(index, stop);
      const nextNonSpace = findNextNonSpace(text, stop);
      push(tokens, quoted, nextNonSpace === ":" ? "key" : "string");
      index = stop;
    } else if (isNumberStart(text, index)) {
      const stop = readNumber(text, index);
      push(tokens, text.slice(index, stop), "number");
      index = stop;
    } else if (
      startsWord(text, index, "true") ||
      startsWord(text, index, "false") ||
      startsWord(text, index, "null")
    ) {
      const stop = readIdentifier(text, index);
      push(tokens, text.slice(index, stop), "literal");
      index = stop;
    } else {
      push(tokens, char, isPunctuation(char) ? "punctuation" : undefined);
      index += 1;
    }
  }
  return tokens;
}

function highlightConfig(
  text: string,
  language: "toml" | "yaml",
): SyntaxToken[] {
  const commentStart = text.search(language === "toml" ? /#/ : /#/);
  const code = commentStart === -1 ? text : text.slice(0, commentStart);
  const comment = commentStart === -1 ? "" : text.slice(commentStart);
  const tokens: SyntaxToken[] = [];
  const keyMatch = code.match(/^(\s*)([A-Za-z0-9_.-]+)(\s*[:=])/);
  if (keyMatch?.[2]) {
    push(tokens, keyMatch[1] ?? "");
    push(tokens, keyMatch[2], "key");
    push(tokens, keyMatch[3] ?? "", "operator");
    pushSimpleValueTokens(tokens, code.slice(keyMatch[0].length));
  } else if (/^\s*\[.*\]/.test(code)) {
    push(tokens, code, "keyword");
  } else {
    pushSimpleValueTokens(tokens, code);
  }
  if (comment) push(tokens, comment, "comment");
  return tokens;
}

function highlightShell(text: string): SyntaxToken[] {
  const tokens: SyntaxToken[] = [];
  let index = 0;
  const keywords = words(
    "case do done elif else esac export fi for function if in local readonly return set shift then unset while",
  );
  while (index < text.length) {
    const char = text[index] ?? "";
    if (char === "#") {
      push(tokens, text.slice(index), "comment");
      break;
    }
    if (char === '"' || char === "'") {
      const stop = readQuoted(text, index, char);
      push(tokens, text.slice(index, stop), "string");
      index = stop;
    } else if (char === "$") {
      const stop = readShellVariable(text, index);
      push(tokens, text.slice(index, stop), "builtin");
      index = stop;
    } else if (isIdentifierStart(char)) {
      const stop = readIdentifier(text, index);
      const word = text.slice(index, stop);
      push(tokens, word, keywords.has(word) ? "keyword" : undefined);
      index = stop;
    } else {
      push(tokens, char, isOperator(char) ? "operator" : undefined);
      index += 1;
    }
  }
  return tokens;
}

function highlightPython(text: string): SyntaxToken[] {
  const commentStart = text.indexOf("#");
  if (commentStart === -1) return highlightCodeLike(text, pythonConfig);
  return [
    ...highlightCodeLike(text.slice(0, commentStart), pythonConfig),
    { text: text.slice(commentStart), kind: "comment" as const },
  ];
}

function highlightMarkdown(text: string): SyntaxToken[] {
  if (/^\s{0,3}#{1,6}\s/.test(text)) return [{ text, kind: "keyword" }];
  if (/^\s*([-*+]|\d+\.)\s/.test(text)) {
    const marker = text.match(/^(\s*(?:[-*+]|\d+\.))/)?.[1] ?? "";
    return [
      { text: marker, kind: "operator" },
      { text: text.slice(marker.length) },
    ];
  }
  if (/^\s*>/.test(text)) return [{ text, kind: "comment" }];
  if (/^\s*```/.test(text)) return [{ text, kind: "keyword" }];
  return highlightInlineMarkdown(text);
}

function highlightCss(text: string): SyntaxToken[] {
  const tokens: SyntaxToken[] = [];
  let index = 0;
  while (index < text.length) {
    const char = text[index] ?? "";
    const next = text[index + 1] ?? "";
    if (char === "/" && next === "*") {
      const end = text.indexOf("*/", index + 2);
      const stop = end === -1 ? text.length : end + 2;
      push(tokens, text.slice(index, stop), "comment");
      index = stop;
    } else if (char === '"' || char === "'") {
      const stop = readQuoted(text, index, char);
      push(tokens, text.slice(index, stop), "string");
      index = stop;
    } else if (isNumberStart(text, index)) {
      const stop = readNumber(text, index);
      push(tokens, text.slice(index, stop), "number");
      index = stop;
    } else if (isIdentifierStart(char) || char === "-") {
      const stop = readCssIdentifier(text, index);
      const word = text.slice(index, stop);
      push(
        tokens,
        word,
        cssKeywords.has(word)
          ? "keyword"
          : findNextNonSpace(text, stop) === ":"
            ? "key"
            : undefined,
      );
      index = stop;
    } else {
      push(
        tokens,
        char,
        isPunctuation(char)
          ? "punctuation"
          : isOperator(char)
            ? "operator"
            : undefined,
      );
      index += 1;
    }
  }
  return tokens;
}

function highlightMarkup(text: string): SyntaxToken[] {
  const tokens: SyntaxToken[] = [];
  let index = 0;
  while (index < text.length) {
    if (text.startsWith("<!--", index)) {
      const end = text.indexOf("-->", index + 4);
      const stop = end === -1 ? text.length : end + 3;
      push(tokens, text.slice(index, stop), "comment");
      index = stop;
    } else if ((text[index] ?? "") === "<") {
      const end = text.indexOf(">", index + 1);
      const stop = end === -1 ? text.length : end + 1;
      highlightTag(tokens, text.slice(index, stop));
      index = stop;
    } else {
      const nextTag = text.indexOf("<", index);
      const stop = nextTag === -1 ? text.length : nextTag;
      push(tokens, text.slice(index, stop));
      index = stop;
    }
  }
  return tokens;
}

function highlightTag(tokens: SyntaxToken[], tag: string): void {
  const parts = tag
    .split(/(\s+|=|"[^"]*"|'[^']*'|[<>/])/g)
    .filter((part) => part !== "");
  let tagNameSeen = false;
  for (const part of parts) {
    if (/^["']/.test(part)) push(tokens, part, "string");
    else if (/^[<>/]$/.test(part)) push(tokens, part, "punctuation");
    else if (part === "=") push(tokens, part, "operator");
    else if (/^\s+$/.test(part)) push(tokens, part);
    else if (!tagNameSeen) {
      tagNameSeen = true;
      push(tokens, part, "keyword");
    } else push(tokens, part, "key");
  }
}

function highlightInlineMarkdown(text: string): SyntaxToken[] {
  const tokens: SyntaxToken[] = [];
  let index = 0;
  while (index < text.length) {
    const codeStart = text.indexOf("`", index);
    const linkStart = text.indexOf("[", index);
    const nextStart =
      [codeStart, linkStart]
        .filter((value) => value >= 0)
        .sort((a, b) => a - b)[0] ?? -1;
    if (nextStart === -1) {
      push(tokens, text.slice(index));
      break;
    }
    if (nextStart > index) push(tokens, text.slice(index, nextStart));
    if (text[nextStart] === "`") {
      const end = text.indexOf("`", nextStart + 1);
      const stop = end === -1 ? text.length : end + 1;
      push(tokens, text.slice(nextStart, stop), "string");
      index = stop;
    } else {
      const end = text.indexOf("]", nextStart + 1);
      const stop = end === -1 ? nextStart + 1 : end + 1;
      push(tokens, text.slice(nextStart, stop), "key");
      index = stop;
    }
  }
  return tokens;
}

function pushSimpleValueTokens(tokens: SyntaxToken[], text: string): void {
  let index = 0;
  while (index < text.length) {
    const char = text[index] ?? "";
    if (char === '"' || char === "'") {
      const stop = readQuoted(text, index, char);
      push(tokens, text.slice(index, stop), "string");
      index = stop;
    } else if (isNumberStart(text, index)) {
      const stop = readNumber(text, index);
      push(tokens, text.slice(index, stop), "number");
      index = stop;
    } else if (isIdentifierStart(char)) {
      const stop = readIdentifier(text, index);
      const word = text.slice(index, stop);
      push(
        tokens,
        word,
        ["true", "false", "null"].includes(word) ? "literal" : undefined,
      );
      index = stop;
    } else {
      push(tokens, char, isPunctuation(char) ? "punctuation" : undefined);
      index += 1;
    }
  }
}

function readQuoted(text: string, start: number, quote: string): number {
  let index = start + 1;
  while (index < text.length) {
    const char = text[index] ?? "";
    if (char === "\\") index += 2;
    else if (char === quote) return index + 1;
    else index += 1;
  }
  return text.length;
}

function readNumber(text: string, start: number): number {
  let index = start;
  while (index < text.length && /[A-Za-z0-9_.]/.test(text[index] ?? ""))
    index += 1;
  return index;
}

function readIdentifier(text: string, start: number): number {
  let index = start + 1;
  while (index < text.length && isIdentifierPart(text[index] ?? "")) index += 1;
  return index;
}

function readCssIdentifier(text: string, start: number): number {
  let index = start;
  while (index < text.length && /[A-Za-z0-9_-]/.test(text[index] ?? ""))
    index += 1;
  return index;
}

function readShellVariable(text: string, start: number): number {
  if (text[start + 1] === "{") {
    const close = text.indexOf("}", start + 2);
    return close === -1 ? text.length : close + 1;
  }
  let index = start + 1;
  while (index < text.length && isIdentifierPart(text[index] ?? "")) index += 1;
  return Math.max(index, start + 1);
}

function isNumberStart(text: string, index: number): boolean {
  const char = text[index] ?? "";
  const next = text[index + 1] ?? "";
  return /\d/.test(char) || (char === "." && /\d/.test(next));
}

function isIdentifierStart(char: string): boolean {
  return /[A-Za-z_$]/.test(char);
}

function isIdentifierPart(char: string): boolean {
  return /[A-Za-z0-9_$-]/.test(char);
}

function isOperator(char: string): boolean {
  return /[+\-*/%=!<>|&^~?:]/.test(char);
}

function isPunctuation(char: string): boolean {
  return /[()[\]{}.,;]/.test(char);
}

function findNextNonSpace(text: string, index: number): string {
  let cursor = index;
  while (cursor < text.length && /\s/.test(text[cursor] ?? "")) cursor += 1;
  return text[cursor] ?? "";
}

function startsWord(text: string, index: number, word: string): boolean {
  if (!text.startsWith(word, index)) return false;
  return !isIdentifierPart(text[index + word.length] ?? "");
}

function words(value: string): Set<string> {
  return new Set(value.split(/\s+/).filter(Boolean));
}

function push(tokens: SyntaxToken[], text: string, kind?: SyntaxKind): void {
  if (!text) return;
  const previous = tokens.at(-1);
  if (previous && previous.kind === kind) {
    previous.text += text;
    return;
  }
  tokens.push(kind ? { text, kind } : { text });
}
