type ElementMap = {
  channelInput: HTMLInputElement | null;
  searchBtn: HTMLElement | null;
  resultsSection: HTMLElement | null;
  clipsGrid: HTMLElement | null;
  rangeFilter: HTMLInputElement | null;
  categoryFilter: HTMLInputElement | null;
  categoryInput: HTMLInputElement | null;
  categoryList: HTMLUListElement | null;
  categoryClear: HTMLButtonElement | null;
  filterSearchInput: HTMLInputElement | null;
  filterSearchClear: HTMLButtonElement | null;
  sortFilter: HTMLInputElement | null;
  clipsCount: HTMLElement | null;
  loader: HTMLElement | null;
  loaderText: HTMLElement | null;
  emptyState: HTMLElement | null;
  recentSearches: HTMLElement | null;
  recentList: HTMLUListElement | null;
  loadOlderBtn: HTMLButtonElement | null;

  modal: HTMLElement | null;
  modalTitle: HTMLElement | null;
  modalCreator: HTMLElement | null;
  modalGame: HTMLElement | null;
  modalDate: HTMLElement | null;
  modalIframe: HTMLIFrameElement | null;
  modalSpinner: HTMLElement | null;
  modalCloseBtn: HTMLElement | null;
  modalCopyBtn: HTMLButtonElement | null;
  modalOpenBtn: HTMLAnchorElement | null;
  modalFavBtn: HTMLButtonElement | null;
  modalDownloadBtn: HTMLButtonElement | null;
  qualitySelectTrigger: HTMLButtonElement | null;
  qualitySelect: HTMLInputElement | null;
  qualitySelectOptions: HTMLUListElement | null;
  downloadProgress: HTMLDivElement | null;
  downloadProgressFill: HTMLDivElement | null;
  downloadProgressText: HTMLSpanElement | null;

  cacheIndicator: HTMLElement | null;
  cacheText: HTMLSpanElement | null;
  cacheRefresh: HTMLButtonElement | null;

  favoritesModal: HTMLElement | null;
  favoritesBtn: HTMLButtonElement | null;
  favoritesCloseBtn: HTMLElement | null;
  favoritesGrid: HTMLElement | null;
  favoritesCount: HTMLElement | null;
  favoritesEmpty: HTMLElement | null;

  modalNotes: HTMLTextAreaElement | null;
  modalNotesSection: HTMLElement | null;
  modalNotesToggle: HTMLElement | null;
};

const IDS: { [K in keyof ElementMap]: string } = {
  channelInput: "channelInput",
  searchBtn: "searchBtn",
  resultsSection: "resultsSection",
  clipsGrid: "clipsGrid",
  rangeFilter: "rangeFilter",
  categoryFilter: "categoryFilter",
  categoryInput: "categoryInput",
  categoryList: "categoryList",
  categoryClear: "categoryClear",
  filterSearchInput: "filterSearchInput",
  filterSearchClear: "filterSearchClear",
  sortFilter: "sortFilter",
  clipsCount: "clipsCount",
  loader: "loader",
  loaderText: "loaderText",
  emptyState: "emptyState",
  recentSearches: "recentSearches",
  recentList: "recentList",
  loadOlderBtn: "loadOlderBtn",

  modal: "clipModal",
  modalTitle: "modalTitle",
  modalCreator: "modalCreator",
  modalGame: "modalGame",
  modalDate: "modalDate",
  modalIframe: "modalIframe",
  modalSpinner: "modalSpinner",
  modalCloseBtn: "modalCloseBtn",
  modalCopyBtn: "modalCopyBtn",
  modalOpenBtn: "modalOpenBtn",
  modalFavBtn: "modalFavBtn",
  modalDownloadBtn: "modalDownloadBtn",
  qualitySelectTrigger: "qualitySelectTrigger",
  qualitySelect: "qualitySelect",
  qualitySelectOptions: "qualitySelectOptions",
  downloadProgress: "downloadProgress",
  downloadProgressFill: "downloadProgressFill",
  downloadProgressText: "downloadProgressText",

  cacheIndicator: "cacheIndicator",
  cacheText: "cacheText",
  cacheRefresh: "cacheRefresh",

  favoritesModal: "favoritesModal",
  favoritesBtn: "favoritesBtn",
  favoritesCloseBtn: "favoritesCloseBtn",
  favoritesGrid: "favoritesGrid",
  favoritesCount: "favoritesCount",
  favoritesEmpty: "favoritesEmpty",

  modalNotes: "modalNotes",
  modalNotesSection: "modalNotesSection",
  modalNotesToggle: "modalNotesToggle",
};

let _cache: ElementMap | null = null;

function buildElements(): ElementMap {
  const out = {} as ElementMap;
  (Object.keys(IDS) as (keyof ElementMap)[]).forEach((key) => {
    out[key] = document.getElementById(IDS[key]) as never;
  });
  return out;
}

export function getElements(): ElementMap {
  if (!_cache) _cache = buildElements();
  return _cache;
}

export function resetElements(): void {
  _cache = null;
}

export function getElement<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

export const elements: ElementMap = new Proxy({} as ElementMap, {
  get(_target, prop: string) {
    return getElements()[prop as keyof ElementMap];
  },
});
