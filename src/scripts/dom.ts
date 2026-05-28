export const elements = {
  channelInput: document.getElementById("channelInput") as HTMLInputElement,
  searchBtn: document.getElementById("searchBtn"),
  resultsSection: document.getElementById("resultsSection"),
  clipsGrid: document.getElementById("clipsGrid"),
  rangeFilter: document.getElementById("rangeFilter") as HTMLInputElement,
  categoryFilter: document.getElementById("categoryFilter") as HTMLInputElement,
  categoryInput: document.getElementById("categoryInput") as HTMLInputElement,
  categoryList: document.getElementById("categoryList") as HTMLUListElement,
  categoryClear: document.getElementById("categoryClear") as HTMLButtonElement,
  filterSearchInput: document.getElementById(
    "filterSearchInput",
  ) as HTMLInputElement,
  filterSearchClear: document.getElementById(
    "filterSearchClear",
  ) as HTMLButtonElement,
  sortFilter: document.getElementById("sortFilter") as HTMLInputElement,
  clipsCount: document.getElementById("clipsCount"),
  loader: document.getElementById("loader"),
  loaderText: document.getElementById("loaderText"),
  emptyState: document.getElementById("emptyState"),
  recentSearches: document.getElementById("recentSearches"),
  recentList: document.getElementById("recentList") as HTMLUListElement,
  loadOlderBtn: document.getElementById("loadOlderBtn") as HTMLButtonElement,

  modal: document.getElementById("clipModal"),
  modalTitle: document.getElementById("modalTitle"),
  modalCreator: document.getElementById("modalCreator"),
  modalGame: document.getElementById("modalGame"),
  modalDate: document.getElementById("modalDate"),
  modalIframe: document.getElementById("modalIframe") as HTMLIFrameElement,
  modalCloseBtn: document.getElementById("modalCloseBtn"),
  modalCopyBtn: document.getElementById("modalCopyBtn") as HTMLButtonElement,
  modalOpenBtn: document.getElementById("modalOpenBtn") as HTMLAnchorElement,
  modalFavBtn: document.getElementById("modalFavBtn") as HTMLButtonElement,
  modalDownloadBtn: document.getElementById(
    "modalDownloadBtn",
  ) as HTMLButtonElement,
  qualitySelectTrigger: document.getElementById(
    "qualitySelectTrigger",
  ) as HTMLButtonElement,
  qualitySelect: document.getElementById("qualitySelect") as HTMLInputElement,
  qualitySelectOptions: document.getElementById(
    "qualitySelectOptions",
  ) as HTMLUListElement,
  downloadProgress: document.getElementById(
    "downloadProgress",
  ) as HTMLDivElement,
  downloadProgressFill: document.getElementById(
    "downloadProgressFill",
  ) as HTMLDivElement,
  downloadProgressText: document.getElementById(
    "downloadProgressText",
  ) as HTMLSpanElement,

  cacheIndicator: document.getElementById("cacheIndicator"),
  cacheText: document.getElementById("cacheText") as HTMLSpanElement,
  cacheRefresh: document.getElementById("cacheRefresh") as HTMLButtonElement,

  favoritesModal: document.getElementById("favoritesModal"),
  favoritesBtn: document.getElementById("favoritesBtn") as HTMLButtonElement,
  favoritesCloseBtn: document.getElementById("favoritesCloseBtn"),
  favoritesGrid: document.getElementById("favoritesGrid"),
  favoritesCount: document.getElementById("favoritesCount"),
  favoritesEmpty: document.getElementById("favoritesEmpty"),

  modalNotes: document.getElementById("modalNotes") as HTMLTextAreaElement,
};
