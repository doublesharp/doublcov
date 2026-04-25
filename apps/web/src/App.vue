<script setup lang="ts">
import {
  isCoverageThemeToken,
  isSafeThemeTokenValue,
  sourceLanguageLabel,
} from "@0xdoublesharp/doublcov-core";
import type {
  CoverageReport,
  CoverageHookContribution,
  CoverageTheme,
  IgnoredLine,
  SourceFileCoverage,
  SourceFilePayload,
  UncoveredKind,
  UncoveredItem,
} from "@0xdoublesharp/doublcov-core";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import {
  highlightSourceLine,
  highlightSourceLines,
  type SyntaxToken,
} from "./syntax";
import { builtInThemes, themeMode, themeTokens } from "./themes";
import { parseReportPayload, parseSourcePayload } from "./reportPayload";

const report = ref<CoverageReport | null>(null);
const selectedFileId = ref("");
const selectedLine = ref<number | null>(null);
const selectedKind = ref<UncoveredKind | "all">("all");
const search = ref("");
const uncoveredOnly = ref(true);
const navigatorCurrentFileOnly = ref(true);
const currentUncoveredIndex = ref(0);
const sourceCache = ref<Record<string, SourceFilePayload>>({});
const sourceWindowStart = ref(1);
const sourceScroller = ref<HTMLElement | null>(null);
const navigatorScroller = ref<HTMLElement | null>(null);
const navigatorScrollTop = ref(0);
const navigatorMinHeight = 220;
const navigatorMaxHeight = 620;
const navigatorDefaultHeight = 280;
const navigatorControlsMinHeight = 216;
const sidePanelMinWidth = 260;
const sidePanelMaxWidth = 560;
const sidePanelDefaultWidth = 360;
const navigatorHeight = ref(readStoredNavigatorHeight());
const navigatorResizeStart = ref<{ y: number; height: number } | null>(null);
const leftPanelWidth = ref(readStoredSidePanelWidth("left"));
const rightPanelWidth = ref(readStoredSidePanelWidth("right"));
const sidePanelResizeStart = ref<{
  panel: "left" | "right";
  x: number;
  width: number;
} | null>(null);
const theme = ref(localStorage.getItem("doublcov-theme") ?? "dark");
const error = ref<string | null>(null);
const helpOpen = ref(false);
const highlightedSourceTokens = ref<Record<number, SyntaxToken[]>>({});
const highlightRequestId = ref(0);
const navigatorRowHeight = 74;
const navigatorOverscan = 6;
const embeddedReportElementId = "doublcov-report-data";
const embeddedSourcesElementId = "doublcov-source-data";
let embeddedSources: Record<string, unknown> | null | undefined;

const selectedFile = computed(
  () =>
    report.value?.files.find((file) => file.id === selectedFileId.value) ??
    null,
);
const availableThemes = computed(() =>
  mergeThemes(builtInThemes, report.value?.customization?.themes ?? []),
);
const selectedTheme = computed(
  () =>
    availableThemes.value.find((candidate) => candidate.id === theme.value) ??
    availableThemes.value[0],
);
const selectedThemeMode = computed(() => themeMode(selectedTheme.value));
const hookContributions = computed(() =>
  sortHooks([
    ...(report.value?.customization?.hooks ?? []),
    ...(report.value?.customization?.plugins ?? []).flatMap(
      (plugin) => plugin.hooks ?? [],
    ),
  ]),
);
const headerHooks = computed(() =>
  hookContributions.value.filter((hook) => hook.hook === "report:header"),
);
const summaryHooks = computed(() =>
  hookContributions.value.filter((hook) => hook.hook === "report:summary"),
);
const sidebarPanelHooks = computed(() =>
  hookContributions.value.filter((hook) => hook.hook === "sidebar:panel"),
);
const fileToolbarHooks = computed(() =>
  hookContributions.value
    .filter((hook) => hook.hook === "file:toolbar")
    .filter((hook) => hookMatchesSelectedFile(hook)),
);
const reportTitle = computed(() => {
  const projectName = report.value?.projectName?.trim();
  return projectName ? `${projectName} Coverage` : "Doublcov";
});
const sourcePayload = computed(() =>
  selectedFileId.value ? sourceCache.value[selectedFileId.value] : null,
);
const lineCoverage = computed(() => {
  const byLine = new Map<number, SourceFileCoverage["lines"][number]>();
  for (const line of selectedFile.value?.lines ?? [])
    byLine.set(line.line, line);
  return byLine;
});

const matchingFiles = computed(() => {
  const needle = search.value.trim().toLowerCase();
  return (report.value?.files ?? [])
    .filter(
      (file) =>
        !uncoveredOnly.value ||
        file.uncovered.lines.length ||
        file.uncovered.functions.length ||
        file.uncovered.branches.length,
    )
    .filter((file) => !needle || file.searchText.includes(needle));
});
const filteredFiles = computed(() => matchingFiles.value.slice(0, 500));
const hiddenFileCount = computed(() =>
  Math.max(0, matchingFiles.value.length - filteredFiles.value.length),
);

const filteredUncoveredItems = computed(() => {
  const needle = search.value.trim().toLowerCase();
  return (report.value?.uncoveredItems ?? [])
    .filter(
      (item) =>
        selectedKind.value === "all" || item.kind === selectedKind.value,
    )
    .filter(
      (item) =>
        !navigatorCurrentFileOnly.value || item.fileId === selectedFileId.value,
    )
    .filter(
      (item) =>
        !needle ||
        `${item.filePath} ${item.label} ${item.detail}`
          .toLowerCase()
          .includes(needle),
    );
});
const navigatorStartIndex = computed(() =>
  Math.max(
    0,
    Math.floor(navigatorScrollTop.value / navigatorRowHeight) -
      navigatorOverscan,
  ),
);
const navigatorEndIndex = computed(() =>
  Math.min(
    filteredUncoveredItems.value.length,
    Math.ceil(
      (navigatorScrollTop.value + navigatorHeight.value) / navigatorRowHeight,
    ) + navigatorOverscan,
  ),
);
const visibleUncoveredItems = computed(() =>
  filteredUncoveredItems.value
    .slice(navigatorStartIndex.value, navigatorEndIndex.value)
    .map((item, offset) => ({
      item,
      index: navigatorStartIndex.value + offset,
    })),
);
const navigatorTotalHeight = computed(
  () => filteredUncoveredItems.value.length * navigatorRowHeight,
);

const currentUncoveredItem = computed(
  () => filteredUncoveredItems.value[currentUncoveredIndex.value] ?? null,
);
const selectedFileIndex = computed(() =>
  filteredFiles.value.findIndex((file) => file.id === selectedFileId.value),
);
const selectedFileUncoveredTotal = computed(() => {
  const file = selectedFile.value;
  if (!file) return 0;
  return (
    file.uncovered.lines.length +
    file.uncovered.functions.length +
    file.uncovered.branches.length
  );
});
const selectedFileIgnoredLines = computed(
  () => selectedFile.value?.ignored.lines ?? [],
);
const totalIgnoredLines = computed(() => report.value?.ignored.lines ?? 0);
const ignoredLinesByLine = computed(() => {
  const byLine = new Map<number, IgnoredLine>();
  for (const line of selectedFileIgnoredLines.value)
    byLine.set(line.line, line);
  return byLine;
});
const previousRun = computed(() => {
  const runs = report.value?.history.runs ?? [];
  return runs.length >= 2 ? runs[runs.length - 2] : null;
});
const currentRun = computed(() => {
  const runs = report.value?.history.runs ?? [];
  return runs.at(-1) ?? null;
});
const lineDelta = computed(() => {
  if (!previousRun.value || !currentRun.value) return null;
  return (
    currentRun.value.totals.lines.percent -
    previousRun.value.totals.lines.percent
  );
});
const visibleSourceLines = computed(() => {
  const lines = sourcePayload.value?.lines ?? [];
  const total = lines.length;
  if (total <= 800) {
    return lines.map((text, index) => ({ number: index + 1, text }));
  }
  const start = Math.max(
    1,
    Math.min(sourceWindowStart.value, Math.max(1, total - 399)),
  );
  return lines
    .slice(start - 1, start + 399)
    .map((text, index) => ({ number: start + index, text }));
});
const selectedUncoveredRange = computed(() => {
  const anchor = selectedLine.value;
  if (!anchor || lineCoverage.value.get(anchor)?.status !== "uncovered")
    return null;

  let start = anchor;
  let end = anchor;
  while (lineCoverage.value.get(start - 1)?.status === "uncovered") start -= 1;
  while (lineCoverage.value.get(end + 1)?.status === "uncovered") end += 1;
  return { start, end };
});
const visibleSourceHighlightKey = computed(() =>
  [
    selectedFile.value?.path ?? selectedFile.value?.displayPath ?? "",
    theme.value,
    selectedThemeMode.value,
    ...visibleSourceLines.value.map(
      (line) => `${line.number}\u0000${line.text}`,
    ),
  ].join("\u0001"),
);

onMounted(async () => {
  applyTheme();
  window.addEventListener("keydown", handleKeyboardShortcut);
  window.addEventListener("mousemove", handleNavigatorResizeMove);
  window.addEventListener("mousemove", handleSidePanelResizeMove);
  window.addEventListener("mouseup", stopNavigatorResize);
  window.addEventListener("mouseup", stopSidePanelResize);
  readHashState();
  try {
    report.value = parseReportPayload(await readReportPayload());
    applyDefaultReportTheme();
    if (!report.value.files.some((file) => file.id === selectedFileId.value)) {
      selectedFileId.value = report.value.files[0]?.id ?? "";
      selectedLine.value = null;
    }
    if (selectedLine.value)
      sourceWindowStart.value = Math.max(1, selectedLine.value - 120);
    await loadSelectedSource();
    await scrollToSelectedLine();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleKeyboardShortcut);
  window.removeEventListener("mousemove", handleNavigatorResizeMove);
  window.removeEventListener("mousemove", handleSidePanelResizeMove);
  window.removeEventListener("mouseup", stopNavigatorResize);
  window.removeEventListener("mouseup", stopSidePanelResize);
});

watch(theme, () => {
  localStorage.setItem("doublcov-theme", theme.value);
  applyTheme();
});

watch(reportTitle, (title) => {
  document.title = title;
});

watch(visibleSourceHighlightKey, () => {
  void refreshHighlightedSourceLines();
});

watch(navigatorHeight, () => {
  localStorage.setItem(
    "doublcov-navigator-height",
    String(navigatorHeight.value),
  );
});

watch(leftPanelWidth, () => {
  localStorage.setItem(
    "doublcov-left-panel-width",
    String(leftPanelWidth.value),
  );
});

watch(rightPanelWidth, () => {
  localStorage.setItem(
    "doublcov-right-panel-width",
    String(rightPanelWidth.value),
  );
});

watch(
  [
    selectedFileId,
    selectedLine,
    selectedKind,
    search,
    uncoveredOnly,
    navigatorCurrentFileOnly,
  ],
  () => {
    writeHashState();
  },
);

watch([selectedKind, search, navigatorCurrentFileOnly], () => {
  currentUncoveredIndex.value = 0;
  navigatorScrollTop.value = 0;
  if (navigatorScroller.value) navigatorScroller.value.scrollTop = 0;
});

watch(selectedFileId, () => {
  if (!navigatorCurrentFileOnly.value) return;
  currentUncoveredIndex.value = 0;
  navigatorScrollTop.value = 0;
  if (navigatorScroller.value) navigatorScroller.value.scrollTop = 0;
});

watch(selectedFileId, async () => {
  sourceWindowStart.value = Math.max(1, (selectedLine.value ?? 1) - 120);
  await loadSelectedSource();
  await scrollToSelectedLine();
});

watch(selectedLine, async () => {
  if (selectedLine.value)
    sourceWindowStart.value = Math.max(1, selectedLine.value - 120);
  await scrollToSelectedLine();
});

function applyTheme(): void {
  const current = selectedTheme.value;
  document.documentElement.dataset.theme = current?.id ?? "dark";
  document.documentElement.classList.toggle(
    "dark",
    selectedThemeMode.value === "dark",
  );
  for (const token of themeTokens)
    document.documentElement.style.removeProperty(`--${token}`);
  for (const [token, value] of Object.entries(current?.tokens ?? {})) {
    if (
      isCoverageThemeToken(token) &&
      typeof value === "string" &&
      isSafeThemeTokenValue(value)
    ) {
      document.documentElement.style.setProperty(`--${token}`, value.trim());
    }
  }
}

function applyDefaultReportTheme(): void {
  const savedTheme = localStorage.getItem("doublcov-theme");
  const defaultTheme = report.value?.customization?.defaultTheme;
  const nextTheme = savedTheme ?? defaultTheme ?? theme.value;
  theme.value = availableThemes.value.some(
    (candidate) => candidate.id === nextTheme,
  )
    ? nextTheme
    : "dark";
  applyTheme();
}

function mergeThemes(
  baseThemes: CoverageTheme[],
  customThemes: CoverageTheme[],
): CoverageTheme[] {
  const themesById = new Map<string, CoverageTheme>();
  for (const candidate of [...baseThemes, ...customThemes]) {
    if (!candidate.id || !candidate.label) continue;
    const existing = themesById.get(candidate.id);
    themesById.set(candidate.id, {
      ...existing,
      ...candidate,
      tokens: {
        ...(existing?.tokens ?? {}),
        ...candidate.tokens,
      },
    });
  }
  return [...themesById.values()];
}

function sortHooks(
  hooks: CoverageHookContribution[],
): CoverageHookContribution[] {
  return [...hooks].sort(
    (a, b) =>
      (a.priority ?? 100) - (b.priority ?? 100) ||
      a.label.localeCompare(b.label),
  );
}

function hookMatchesSelectedFile(hook: CoverageHookContribution): boolean {
  const file = selectedFile.value;
  if (!file) return false;
  if (
    hook.filePath &&
    hook.filePath !== file.path &&
    hook.filePath !== file.displayPath
  )
    return false;
  if (hook.language && hook.language !== file.language) return false;
  return true;
}

function cycleTheme(): void {
  const themes = availableThemes.value;
  const currentIndex = Math.max(
    0,
    themes.findIndex((candidate) => candidate.id === theme.value),
  );
  theme.value = themes[(currentIndex + 1) % themes.length]?.id ?? "dark";
}

async function loadSelectedSource(): Promise<void> {
  const file = selectedFile.value;
  if (!file || sourceCache.value[file.id]) return;
  const embeddedPayload = readEmbeddedSourcePayload(file.sourceDataPath);
  if (embeddedPayload !== undefined) {
    sourceCache.value = {
      ...sourceCache.value,
      [file.id]: parseSourcePayload(embeddedPayload, file.path),
    };
    return;
  }
  const response = await fetch(file.sourceDataPath);
  if (!response.ok) throw new Error(`Could not load source for ${file.path}.`);
  sourceCache.value = {
    ...sourceCache.value,
    [file.id]: parseSourcePayload(await response.json(), file.path),
  };
}

async function readReportPayload(): Promise<unknown> {
  const embeddedPayload = readEmbeddedJsonElement(embeddedReportElementId);
  if (embeddedPayload !== undefined) return embeddedPayload;

  const response = await fetch("data/report.json");
  if (!response.ok)
    throw new Error(`Could not load report data (${response.status}).`);
  return response.json();
}

function readEmbeddedSourcePayload(
  sourceDataPath: string,
): unknown | undefined {
  embeddedSources ??= readEmbeddedSourcePayloads();
  return embeddedSources?.[sourceDataPath];
}

function readEmbeddedSourcePayloads(): Record<string, unknown> | null {
  const payload = readEmbeddedJsonElement(embeddedSourcesElementId);
  if (!isUnknownRecord(payload)) return null;
  return payload;
}

function readEmbeddedJsonElement(id: string): unknown | undefined {
  const text = document.getElementById(id)?.textContent;
  if (!text) return undefined;
  return JSON.parse(text);
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function selectFile(
  fileId: string,
  line: number | null = null,
): Promise<void> {
  selectedFileId.value = fileId;
  selectedLine.value = line;
  if (line) sourceWindowStart.value = Math.max(1, line - 120);
  await loadSelectedSource();
  await scrollToSelectedLine(line);
}

async function refreshHighlightedSourceLines(): Promise<void> {
  const requestId = highlightRequestId.value + 1;
  highlightRequestId.value = requestId;
  const lines = visibleSourceLines.value;
  const filePath =
    selectedFile.value?.path ?? selectedFile.value?.displayPath ?? "";

  if (!lines.length) {
    highlightedSourceTokens.value = {};
    return;
  }

  const tokenRows = await highlightSourceLines(
    lines.map((line) => line.text),
    filePath,
    selectedThemeMode.value,
  );
  if (highlightRequestId.value !== requestId) return;

  highlightedSourceTokens.value = Object.fromEntries(
    lines.map((line, index) => [
      line.number,
      tokenRows[index] ?? highlightSourceLine(line.text, filePath),
    ]),
  );
}

async function jumpToItem(item: UncoveredItem): Promise<void> {
  await selectFile(item.fileId, item.line);
  currentUncoveredIndex.value = Math.max(
    0,
    filteredUncoveredItems.value.findIndex(
      (candidate) => candidate.id === item.id,
    ),
  );
  scrollNavigatorToIndex(currentUncoveredIndex.value);
}

async function pageUncovered(direction: -1 | 1): Promise<void> {
  const next = Math.min(
    Math.max(currentUncoveredIndex.value + direction, 0),
    filteredUncoveredItems.value.length - 1,
  );
  currentUncoveredIndex.value = next;
  const item = filteredUncoveredItems.value[next];
  if (item) await jumpToItem(item);
}

function handleNavigatorScroll(event: Event): void {
  navigatorScrollTop.value = (event.currentTarget as HTMLElement).scrollTop;
}

function scrollNavigatorToIndex(index: number): void {
  const scroller = navigatorScroller.value;
  if (!scroller || index < 0) return;

  const itemTop = index * navigatorRowHeight;
  const itemBottom = itemTop + navigatorRowHeight;
  if (itemTop < scroller.scrollTop) {
    scroller.scrollTo({ top: itemTop, behavior: "smooth" });
  } else if (itemBottom > scroller.scrollTop + scroller.clientHeight) {
    scroller.scrollTo({
      top: itemBottom - scroller.clientHeight,
      behavior: "smooth",
    });
  }
}

function startNavigatorResize(event: MouseEvent): void {
  navigatorResizeStart.value = {
    y: event.clientY,
    height: navigatorHeight.value,
  };
  document.body.classList.add("resizing-navigator");
  event.preventDefault();
}

function handleNavigatorResizeMove(event: MouseEvent): void {
  const start = navigatorResizeStart.value;
  if (!start) return;

  const nextHeight = start.height + event.clientY - start.y;
  navigatorHeight.value = Math.min(
    Math.max(nextHeight, navigatorMinHeight),
    navigatorMaxHeight,
  );
}

function stopNavigatorResize(): void {
  if (!navigatorResizeStart.value) return;
  navigatorResizeStart.value = null;
  document.body.classList.remove("resizing-navigator");
}

function startSidePanelResize(
  panel: "left" | "right",
  event: MouseEvent,
): void {
  sidePanelResizeStart.value = {
    panel,
    x: event.clientX,
    width: panel === "left" ? leftPanelWidth.value : rightPanelWidth.value,
  };
  document.body.classList.add("resizing-side-panel");
  event.preventDefault();
}

function handleSidePanelResizeMove(event: MouseEvent): void {
  const start = sidePanelResizeStart.value;
  if (!start) return;

  const delta = event.clientX - start.x;
  const nextWidth =
    start.panel === "left" ? start.width + delta : start.width - delta;
  setSidePanelWidth(start.panel, nextWidth);
}

function stopSidePanelResize(): void {
  if (!sidePanelResizeStart.value) return;
  sidePanelResizeStart.value = null;
  document.body.classList.remove("resizing-side-panel");
}

function handleSidePanelResizeKey(
  panel: "left" | "right",
  event: KeyboardEvent,
): void {
  if (
    event.key !== "ArrowLeft" &&
    event.key !== "ArrowRight" &&
    event.key !== "Home" &&
    event.key !== "End"
  )
    return;

  event.preventDefault();
  if (event.key === "Home") {
    setSidePanelWidth(panel, sidePanelMinWidth);
    return;
  }
  if (event.key === "End") {
    setSidePanelWidth(panel, sidePanelMaxWidth);
    return;
  }

  const currentWidth =
    panel === "left" ? leftPanelWidth.value : rightPanelWidth.value;
  const direction = event.key === "ArrowRight" ? 1 : -1;
  const signedStep = panel === "left" ? direction * 24 : direction * -24;
  setSidePanelWidth(panel, currentWidth + signedStep);
}

function setSidePanelWidth(panel: "left" | "right", width: number): void {
  const nextWidth = Math.min(
    Math.max(Math.round(width), sidePanelMinWidth),
    sidePanelMaxWidth,
  );
  if (panel === "left") {
    leftPanelWidth.value = nextWidth;
  } else {
    rightPanelWidth.value = nextWidth;
  }
}

async function pageFile(direction: -1 | 1): Promise<void> {
  if (filteredFiles.value.length === 0) return;
  const currentIndex =
    selectedFileIndex.value >= 0 ? selectedFileIndex.value : 0;
  const nextIndex = Math.min(
    Math.max(currentIndex + direction, 0),
    filteredFiles.value.length - 1,
  );
  const file = filteredFiles.value[nextIndex];
  if (file) await selectFile(file.id);
}

async function jumpToCurrentUncovered(): Promise<void> {
  const item = currentUncoveredItem.value ?? filteredUncoveredItems.value[0];
  if (item) await jumpToItem(item);
}

function cycleUncoveredKind(): void {
  const kinds: Array<UncoveredKind | "all"> = [
    "all",
    "line",
    "branch",
    "function",
  ];
  const nextIndex = (kinds.indexOf(selectedKind.value) + 1) % kinds.length;
  selectedKind.value = kinds[nextIndex] ?? "all";
}

async function handleKeyboardShortcut(event: KeyboardEvent): Promise<void> {
  if (event.key === "Escape" && helpOpen.value) {
    event.preventDefault();
    helpOpen.value = false;
    return;
  }
  if (
    helpOpen.value ||
    isEditableTarget(event.target) ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey
  )
    return;

  const key = event.key.toLowerCase();
  if (key === "j" || event.key === "]") {
    event.preventDefault();
    await pageUncovered(1);
  } else if (key === "k" || event.key === "[") {
    event.preventDefault();
    await pageUncovered(-1);
  } else if (key === "n") {
    event.preventDefault();
    await pageFile(1);
  } else if (key === "p") {
    event.preventDefault();
    await pageFile(-1);
  } else if (key === "f") {
    event.preventDefault();
    navigatorCurrentFileOnly.value = !navigatorCurrentFileOnly.value;
  } else if (key === "g") {
    event.preventDefault();
    await jumpToCurrentUncovered();
  } else if (key === "t") {
    event.preventDefault();
    cycleTheme();
  } else if (key === "u") {
    event.preventDefault();
    cycleUncoveredKind();
  } else if (key === "/") {
    event.preventDefault();
    document
      .querySelector<HTMLInputElement>('[data-search-input="true"]')
      ?.focus();
  } else if (event.key === "?") {
    event.preventDefault();
    helpOpen.value = true;
  } else if (event.key === "Escape") {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
  }
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

async function scrollToSelectedLine(
  lineNumber = selectedLine.value,
): Promise<void> {
  if (!lineNumber) return;
  await nextTick();
  await nextTick();

  const target = document.getElementById(`L${lineNumber}`);
  if (!target) return;

  const scroller = sourceScroller.value;
  if (!scroller) {
    target.scrollIntoView({
      block: "center",
      inline: "nearest",
      behavior: "smooth",
    });
    return;
  }

  const targetRect = target.getBoundingClientRect();
  const scrollerRect = scroller.getBoundingClientRect();
  const targetCenter =
    targetRect.top -
    scrollerRect.top +
    scroller.scrollTop +
    targetRect.height / 2;
  scroller.scrollTo({
    top: Math.max(0, targetCenter - scroller.clientHeight / 2),
    behavior: "smooth",
  });
}

function coverageClass(lineNumber: number): string {
  const status = lineCoverage.value.get(lineNumber)?.status ?? "neutral";
  return {
    covered: "bg-[var(--covered)]",
    partial: "bg-[var(--partial)]",
    uncovered: "bg-[var(--uncovered)]",
    ignored: "ignored-line",
    neutral: "",
  }[status];
}

function selectionClass(lineNumber: number): string {
  const range = selectedUncoveredRange.value;
  if (!range) return selectedLine.value === lineNumber ? "selected-line" : "";
  if (lineNumber < range.start || lineNumber > range.end) return "";

  return [
    "selected-uncovered-section",
    lineNumber === range.start ? "selected-uncovered-section-start" : "",
    lineNumber === range.end ? "selected-uncovered-section-end" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function hitLabel(lineNumber: number): string {
  const line = lineCoverage.value.get(lineNumber);
  if (!line) return "";
  if (line.status === "ignored") return ignoredLineShortLabel(lineNumber);
  return line.hits > 0 ? String(line.hits) : "0";
}

function ignoredLineShortLabel(lineNumber: number): string {
  const ignored = ignoredLinesByLine.value.get(lineNumber);
  if (ignored?.reason === "solidity-assembly") return "asm";
  return "ign";
}

function highlightedLine(line: {
  number: number;
  text: string;
}): SyntaxToken[] {
  return (
    highlightedSourceTokens.value[line.number] ??
    highlightSourceLine(
      line.text,
      selectedFile.value?.path ?? selectedFile.value?.displayPath ?? "",
    )
  );
}

function percent(value: number): string {
  return `${value.toFixed(2)}%`;
}

function readHashState(): void {
  const params = new URLSearchParams(location.hash.replace(/^#/, ""));
  selectedFileId.value = params.get("file") ?? "";
  selectedLine.value = parsePositiveInteger(params.get("line"));
  selectedKind.value = parseUncoveredKind(params.get("kind"));
  search.value = params.get("q") ?? "";
  uncoveredOnly.value = params.get("uncovered") !== "0";
  navigatorCurrentFileOnly.value = params.get("navFile") !== "0";
}

function writeHashState(): void {
  const params = new URLSearchParams();
  if (selectedFileId.value) params.set("file", selectedFileId.value);
  if (selectedLine.value) params.set("line", String(selectedLine.value));
  if (selectedKind.value !== "all") params.set("kind", selectedKind.value);
  if (search.value) params.set("q", search.value);
  if (!uncoveredOnly.value) params.set("uncovered", "0");
  if (!navigatorCurrentFileOnly.value) params.set("navFile", "0");
  history.replaceState(null, "", `#${params.toString()}`);
}

function readStoredNavigatorHeight(): number {
  return parseBoundedInteger(
    localStorage.getItem("doublcov-navigator-height"),
    navigatorMinHeight,
    navigatorMaxHeight,
    navigatorDefaultHeight,
  );
}

function readStoredSidePanelWidth(panel: "left" | "right"): number {
  return parseBoundedInteger(
    localStorage.getItem(`doublcov-${panel}-panel-width`),
    sidePanelMinWidth,
    sidePanelMaxWidth,
    sidePanelDefaultWidth,
  );
}

function parsePositiveInteger(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseBoundedInteger(
  value: string | null,
  min: number,
  max: number,
  fallback: number,
): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function parseUncoveredKind(value: string | null): UncoveredKind | "all" {
  if (value === "line" || value === "branch" || value === "function")
    return value;
  return "all";
}
</script>

<template>
  <main class="min-h-screen">
    <div class="mx-auto flex max-w-[1800px] flex-col gap-4 px-4 py-4 lg:px-6">
      <header class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-2xl font-semibold tracking-normal">
            {{ reportTitle }}
          </h1>
          <p class="muted text-sm" v-if="report">
            Generated {{ new Date(report.generatedAt).toLocaleString() }} ·
            {{ report.files.length }} files
          </p>
        </div>
        <div class="flex items-center gap-2">
          <template v-for="hook in headerHooks" :key="hook.id">
            <a
              v-if="hook.href"
              class="focus-ring panel px-3 py-2 text-sm"
              :href="hook.href"
              target="_blank"
              rel="noreferrer"
            >
              {{ hook.label }}
            </a>
            <span v-else class="panel px-3 py-2 text-sm">
              {{ hook.content ?? hook.label }}
            </span>
          </template>
          <select v-model="theme" class="focus-ring panel px-3 py-2 text-sm">
            <option
              v-for="candidate in availableThemes"
              :key="candidate.id"
              :value="candidate.id"
            >
              {{ candidate.label }}
            </option>
          </select>
          <button
            class="focus-ring panel grid size-10 place-items-center text-base font-semibold"
            type="button"
            title="Help"
            aria-label="Open help"
            @click="helpOpen = true"
          >
            ?
          </button>
        </div>
      </header>

      <section
        v-if="error"
        class="panel border-red-400 p-4 text-red-700 dark:text-red-200"
      >
        {{ error }}
      </section>

      <template v-if="report">
        <section class="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
          <div class="panel p-3">
            <div class="muted text-[11px] font-medium uppercase tracking-wide">
              Lines
            </div>
            <div class="mt-1 text-xl font-semibold leading-tight">
              {{ percent(report.totals.lines.percent) }}
            </div>
            <div class="muted text-xs">
              {{ report.totals.lines.hit }} / {{ report.totals.lines.found }}
            </div>
            <div v-if="totalIgnoredLines" class="muted mt-0.5 text-xs">
              excludes {{ totalIgnoredLines }} ignored lines
            </div>
          </div>
          <div class="panel p-3">
            <div class="muted text-[11px] font-medium uppercase tracking-wide">
              Functions
            </div>
            <div class="mt-1 text-xl font-semibold leading-tight">
              {{ percent(report.totals.functions.percent) }}
            </div>
            <div class="muted text-xs">
              {{ report.totals.functions.hit }} /
              {{ report.totals.functions.found }}
            </div>
          </div>
          <div class="panel p-3">
            <div class="muted text-[11px] font-medium uppercase tracking-wide">
              Branches
            </div>
            <div class="mt-1 text-xl font-semibold leading-tight">
              {{ percent(report.totals.branches.percent) }}
            </div>
            <div class="muted text-xs">
              {{ report.totals.branches.hit }} /
              {{ report.totals.branches.found }}
            </div>
          </div>
          <div class="panel p-3">
            <div class="muted text-[11px] font-medium uppercase tracking-wide">
              Uncovered
            </div>
            <div class="mt-1 text-xl font-semibold leading-tight">
              {{ report.uncoveredItems.length }}
            </div>
            <div class="muted text-xs">lines, branches, functions</div>
          </div>
          <div class="panel p-3">
            <div class="muted text-[11px] font-medium uppercase tracking-wide">
              Trend
            </div>
            <div
              class="mt-1 text-xl font-semibold leading-tight"
              :class="
                lineDelta !== null && lineDelta < 0
                  ? 'text-red-500'
                  : 'text-emerald-500'
              "
            >
              {{
                lineDelta === null
                  ? "n/a"
                  : `${lineDelta >= 0 ? "+" : ""}${lineDelta.toFixed(2)}%`
              }}
            </div>
            <div class="muted text-xs">line delta vs previous run</div>
          </div>
          <div class="panel p-3">
            <div class="muted text-[11px] font-medium uppercase tracking-wide">
              Diagnostics
            </div>
            <div class="mt-1 text-xl font-semibold leading-tight">
              {{ report.diagnostics.length }}
            </div>
            <div class="muted text-xs">diagnostic entries</div>
          </div>
          <div v-for="hook in summaryHooks" :key="hook.id" class="panel p-3">
            <div class="muted text-[11px] font-medium uppercase tracking-wide">
              {{ hook.label }}
            </div>
            <div class="mt-1 text-xl font-semibold leading-tight">
              {{ hook.content ?? "active" }}
            </div>
          </div>
        </section>

        <section
          class="report-layout grid h-[calc(100vh-236px)] min-h-[720px] gap-4"
          :style="{
            '--left-panel-width': `${leftPanelWidth}px`,
            '--right-panel-width': `${rightPanelWidth}px`,
          }"
        >
          <aside class="panel relative flex min-h-0 flex-col overflow-hidden">
            <button
              class="side-panel-resize-handle side-panel-resize-handle-right focus-ring"
              type="button"
              role="separator"
              aria-orientation="vertical"
              title="Resize file list"
              aria-label="Resize file list panel"
              @mousedown="startSidePanelResize('left', $event)"
              @keydown="handleSidePanelResizeKey('left', $event)"
            />
            <div class="border-b border-[var(--border)] p-3">
              <input
                v-model="search"
                data-search-input="true"
                class="focus-ring w-full rounded-md border border-[var(--border)] bg-[var(--panel-soft)] px-3 py-2 text-sm"
                placeholder="Search files, functions, source"
              />
              <label class="mt-3 flex items-center gap-2 text-sm">
                <input v-model="uncoveredOnly" type="checkbox" />
                Only files with uncovered items
              </label>
            </div>
            <div class="min-h-0 flex-1 overflow-auto">
              <button
                v-for="file in filteredFiles"
                :key="file.id"
                class="focus-ring block w-full border-b border-[var(--border)] px-3 py-3 text-left hover:bg-[var(--panel-soft)]"
                :class="
                  file.id === selectedFileId ? 'bg-[var(--panel-soft)]' : ''
                "
                @click="selectFile(file.id)"
              >
                <div class="truncate text-sm font-medium">
                  {{ file.displayPath }}
                </div>
                <div class="muted mt-1 text-xs">
                  {{ percent(file.totals.lines.percent) }} lines ·
                  {{
                    file.uncovered.lines.length +
                    file.uncovered.functions.length +
                    file.uncovered.branches.length
                  }}
                  gaps
                </div>
              </button>
              <div
                v-if="hiddenFileCount"
                class="muted border-b border-[var(--border)] px-3 py-3 text-xs"
              >
                Showing first {{ filteredFiles.length }} of
                {{ matchingFiles.length }} matching files. Narrow the search to
                reveal {{ hiddenFileCount }} more.
              </div>
            </div>
          </aside>

          <section class="panel flex min-h-0 min-w-0 flex-col overflow-hidden">
            <div
              class="z-10 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--panel)] p-3"
            >
              <div class="min-w-0">
                <h2 class="truncate text-base font-semibold">
                  {{ selectedFile?.displayPath }}
                </h2>
                <p class="muted text-xs">
                  {{
                    selectedFile
                      ? `${sourceLanguageLabel(selectedFile.language)} · ${percent(selectedFile.totals.lines.percent)} lines · ${selectedFile.lineCount} source lines`
                      : ""
                  }}
                </p>
              </div>
              <div
                v-if="selectedFile"
                class="flex flex-wrap items-center gap-2 text-xs"
              >
                <span class="rounded border border-[var(--border)] px-2 py-1">
                  Lines {{ percent(selectedFile.totals.lines.percent) }} ·
                  {{ selectedFile.totals.lines.hit }}/{{
                    selectedFile.totals.lines.found
                  }}
                </span>
                <span class="rounded border border-[var(--border)] px-2 py-1">
                  Functions
                  {{ percent(selectedFile.totals.functions.percent) }} ·
                  {{ selectedFile.totals.functions.hit }}/{{
                    selectedFile.totals.functions.found
                  }}
                </span>
                <span class="rounded border border-[var(--border)] px-2 py-1">
                  Branches {{ percent(selectedFile.totals.branches.percent) }} ·
                  {{ selectedFile.totals.branches.hit }}/{{
                    selectedFile.totals.branches.found
                  }}
                </span>
                <span class="rounded bg-[var(--uncovered)] px-2 py-1">
                  {{ selectedFileUncoveredTotal }} uncovered
                </span>
                <span
                  v-if="selectedFileIgnoredLines.length"
                  class="rounded bg-[var(--ignored)] px-2 py-1"
                >
                  {{ selectedFileIgnoredLines.length }} ignored
                </span>
                <template v-for="hook in fileToolbarHooks" :key="hook.id">
                  <a
                    v-if="hook.href"
                    class="focus-ring rounded border border-[var(--border)] px-2 py-1 hover:bg-[var(--panel-soft)]"
                    :href="hook.href"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {{ hook.label }}
                  </a>
                  <span
                    v-else
                    class="rounded border border-[var(--border)] px-2 py-1"
                  >
                    {{ hook.content ?? hook.label }}
                  </span>
                </template>
              </div>
              <div class="flex items-center gap-2 text-xs">
                <span class="rounded bg-[var(--covered)] px-2 py-1"
                  >covered</span
                >
                <span class="rounded bg-[var(--partial)] px-2 py-1"
                  >partial</span
                >
                <span class="rounded bg-[var(--uncovered)] px-2 py-1"
                  >uncovered</span
                >
                <span class="rounded bg-[var(--ignored)] px-2 py-1"
                  >ignored</span
                >
              </div>
            </div>
            <div
              v-if="sourcePayload && sourcePayload.lines.length > 800"
              class="border-b border-[var(--border)] bg-[var(--panel-soft)] px-3 py-2 text-sm"
            >
              Showing a 400-line window for responsiveness.
              <button
                class="ml-2 underline"
                @click="
                  sourceWindowStart = Math.max(1, sourceWindowStart - 400)
                "
              >
                Previous window
              </button>
              <button
                class="ml-2 underline"
                @click="sourceWindowStart = sourceWindowStart + 400"
              >
                Next window
              </button>
            </div>
            <div
              ref="sourceScroller"
              class="min-h-0 flex-1 overflow-auto bg-[var(--code-bg)] font-mono text-xs leading-6"
            >
              <div
                v-for="line in visibleSourceLines"
                :id="`L${line.number}`"
                :key="line.number"
                class="code-line border-b border-black/5 dark:border-white/5"
                :class="[
                  coverageClass(line.number),
                  selectionClass(line.number),
                ]"
              >
                <button
                  class="muted pr-3 text-right"
                  @click="selectedLine = line.number"
                >
                  {{ line.number }}
                </button>
                <span class="muted text-right">{{
                  hitLabel(line.number)
                }}</span>
                <pre class="px-3"><code><span
                  v-for="(token, tokenIndex) in highlightedLine(line)"
                  :key="tokenIndex"
                  :class="token.kind ? `syn-${token.kind}` : ''"
                  :style="token.style"
                >{{ token.text }}</span></code></pre>
              </div>
            </div>
          </section>

          <aside class="relative flex min-h-0 flex-col gap-4">
            <button
              class="side-panel-resize-handle side-panel-resize-handle-left focus-ring"
              type="button"
              role="separator"
              aria-orientation="vertical"
              title="Resize details panel"
              aria-label="Resize details panel"
              @mousedown="startSidePanelResize('right', $event)"
              @keydown="handleSidePanelResizeKey('right', $event)"
            />
            <section
              class="panel flex shrink-0 flex-col overflow-hidden"
              :style="{
                minHeight: `${navigatorMinHeight + navigatorControlsMinHeight}px`,
              }"
            >
              <div class="border-b border-[var(--border)] p-3">
                <div class="flex items-center justify-between gap-2">
                  <h2 class="font-semibold">Uncovered Navigator</h2>
                  <div class="flex gap-1">
                    <button
                      class="focus-ring panel px-2 py-1 text-sm"
                      @click="pageUncovered(-1)"
                    >
                      Prev
                    </button>
                    <button
                      class="focus-ring panel px-2 py-1 text-sm"
                      @click="pageUncovered(1)"
                    >
                      Next
                    </button>
                  </div>
                </div>
                <select
                  v-model="selectedKind"
                  class="focus-ring mt-3 w-full rounded-md border border-[var(--border)] bg-[var(--panel-soft)] px-3 py-2 text-sm"
                >
                  <option value="all">All uncovered</option>
                  <option value="line">Lines</option>
                  <option value="function">Functions</option>
                  <option value="branch">Branches</option>
                </select>
                <label class="mt-3 flex items-center gap-2 text-sm">
                  <input v-model="navigatorCurrentFileOnly" type="checkbox" />
                  Current file only
                </label>
                <p class="muted mt-2 text-xs">
                  {{ filteredUncoveredItems.length }} matching uncovered items
                </p>
              </div>
              <div
                ref="navigatorScroller"
                class="overflow-auto"
                :style="{
                  height: `${navigatorHeight}px`,
                  minHeight: `${navigatorMinHeight}px`,
                }"
                @scroll="handleNavigatorScroll"
              >
                <div
                  class="relative"
                  :style="{ height: `${navigatorTotalHeight}px` }"
                >
                  <button
                    v-for="entry in visibleUncoveredItems"
                    :key="entry.item.id"
                    class="focus-ring absolute left-0 block w-full border-b border-[var(--border)] px-3 py-2 text-left text-sm hover:bg-[var(--panel-soft)]"
                    :class="
                      currentUncoveredItem?.id === entry.item.id
                        ? 'bg-[var(--panel-soft)]'
                        : 'bg-[var(--panel)]'
                    "
                    :style="{
                      height: `${navigatorRowHeight}px`,
                      transform: `translateY(${entry.index * navigatorRowHeight}px)`,
                    }"
                    @click="jumpToItem(entry.item)"
                  >
                    <div class="truncate font-medium">
                      {{ entry.item.label }}
                      <span class="muted">· {{ entry.item.kind }}</span>
                    </div>
                    <div class="muted truncate text-xs">
                      {{ entry.item.filePath }}:{{ entry.item.line }}
                    </div>
                  </button>
                </div>
              </div>
              <button
                class="navigator-resize-handle focus-ring m-2"
                type="button"
                title="Drag to resize uncovered navigator"
                @mousedown="startNavigatorResize"
              />
            </section>

            <section class="panel p-3">
              <h2 class="font-semibold">History</h2>
              <div class="mt-3 flex items-end gap-1">
                <div
                  v-for="run in report.history.runs.slice(-20)"
                  :key="run.id"
                  class="min-h-2 flex-1 rounded-t bg-[var(--accent)]"
                  :style="{
                    height: `${Math.max(8, run.totals.lines.percent * 1.2)}px`,
                  }"
                  :title="`${new Date(run.timestamp).toLocaleString()}: ${percent(run.totals.lines.percent)}`"
                />
              </div>
              <p class="muted mt-2 text-xs">
                {{ report.history.runs.length }} stored runs. History is written
                by the CLI at build time.
              </p>
            </section>

            <section
              v-if="report.diagnostics.length"
              class="panel overflow-hidden"
            >
              <div class="border-b border-[var(--border)] p-3">
                <h2 class="font-semibold">Diagnostics</h2>
              </div>
              <div class="max-h-[180px] overflow-auto">
                <div
                  v-for="diagnostic in report.diagnostics"
                  :key="diagnostic.id"
                  class="border-b border-[var(--border)] px-3 py-2 text-sm"
                >
                  <div class="font-medium">{{ diagnostic.source }}</div>
                  <div class="muted">{{ diagnostic.message }}</div>
                </div>
              </div>
            </section>

            <section
              v-for="hook in sidebarPanelHooks"
              :key="hook.id"
              class="panel overflow-hidden"
            >
              <div class="border-b border-[var(--border)] p-3">
                <h2 class="font-semibold">{{ hook.label }}</h2>
              </div>
              <div class="p-3 text-sm">
                <a
                  v-if="hook.href"
                  class="text-[var(--accent)] underline"
                  :href="hook.href"
                  target="_blank"
                  rel="noreferrer"
                >
                  {{ hook.content ?? hook.href }}
                </a>
                <p v-else class="muted whitespace-pre-wrap">
                  {{ hook.content }}
                </p>
              </div>
            </section>
          </aside>
        </section>
      </template>
    </div>

    <div
      v-if="helpOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="presentation"
      @click="helpOpen = false"
    >
      <section
        class="panel max-h-[min(720px,calc(100vh-2rem))] w-full max-w-xl overflow-auto p-5 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="doublcov-help-title"
        @click.stop
      >
        <div class="flex items-center justify-between gap-3">
          <h2 id="doublcov-help-title" class="text-lg font-semibold">Help</h2>
          <button
            class="focus-ring panel grid size-9 place-items-center text-lg leading-none"
            type="button"
            title="Close"
            aria-label="Close help"
            @click="helpOpen = false"
          >
            ×
          </button>
        </div>
        <p class="muted mt-4 text-sm leading-6">
          Generate or provide LCOV, then use the navigator to move through
          uncovered lines, functions, and branches. Language-specific rules can
          add focused adjustments such as Solidity assembly exclusion.
        </p>
        <div
          class="muted mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm"
        >
          <kbd>J</kbd><span>Next uncovered item</span> <kbd>K</kbd
          ><span>Previous uncovered item</span> <kbd>F</kbd
          ><span>Toggle current-file navigator</span> <kbd>U</kbd
          ><span>Cycle uncovered type</span> <kbd>N</kbd><span>Next file</span>
          <kbd>P</kbd><span>Previous file</span> <kbd>/</kbd
          ><span>Focus search</span> <kbd>T</kbd><span>Toggle theme</span>
          <kbd>?</kbd><span>Open help</span> <kbd>Esc</kbd
          ><span>Close help</span>
        </div>
      </section>
    </div>
  </main>
</template>
