function initCustomSelect(
  triggerId: string,
  optionsId: string,
  hiddenId: string,
) {
  const trigger = document.getElementById(triggerId) as HTMLButtonElement;
  const options = document.getElementById(optionsId) as HTMLUListElement;
  const hidden = document.getElementById(hiddenId) as HTMLInputElement;
  if (!trigger || !options || !hidden) return;

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    document.querySelectorAll(".custom-select-options.open").forEach((el) => {
      if (el.id !== optionsId) el.classList.remove("open");
    });
    options.classList.toggle("open");
  });

  options.querySelectorAll("li").forEach((li) => {
    li.addEventListener("click", () => {
      hidden.value = li.dataset.value || "";
      trigger.textContent = li.textContent;
      options.classList.remove("open");
      hidden.dispatchEvent(new Event("change"));
    });
  });

  document.addEventListener("click", (e) => {
    if (
      !trigger.contains(e.target as Node) &&
      !options.contains(e.target as Node)
    ) {
      options.classList.remove("open");
    }
  });
}

export function initFilters() {
  initCustomSelect("rangeFilterTrigger", "rangeFilterOptions", "rangeFilter");
  initCustomSelect("sortFilterTrigger", "sortFilterOptions", "sortFilter");
}
