function updateQuickHelpLanguage() {
 const language = document.querySelector("#uiLanguage")?.value === "bg" ? "bg" : "en";
 for (const element of document.querySelectorAll("[data-help-lang]"))
   element.hidden = element.dataset.helpLang !== language;
}
document.querySelector("#uiLanguage")?.addEventListener("change", updateQuickHelpLanguage);
queueMicrotask(updateQuickHelpLanguage);
