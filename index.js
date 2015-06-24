//     This file is part of Play/Pause extension for Mozilla Firefox
//     https://github.com/DanielKamkha/PlayPauseFirefox
//     (c) 2015 Daniel Kamkha
//     Play/Pause is free software distributed under the terms of the MIT license.

// TODO: icon
// TODO: test with major sites, review the need of site-specific fixes
// TODO: v1.0: research feasibility of site-specific Flash fixes

(function() {
  "use strict";

  const { viewFor } = require("sdk/view/core");
  const { getTabId } = require("sdk/tabs/utils");

  const playSymbol = "▶︎";
  const pauseSymbol = "❚❚";
  const playSymbolAlt = "▶";
  const stripSymbols = [playSymbol, playSymbolAlt];

  let workers = {}; // workers cache

  function getPlayPauseElement(xulTab) {
    return xulTab.ownerDocument.getAnonymousElementByAttribute(xulTab, "anonid", "play-pause");
  }

  function getTabLabelElement(xulTab) {
    return xulTab.ownerDocument.getAnonymousElementByAttribute(xulTab, "anonid", "tab-label");
  }

  function addPlayPauseSymbol(xulTab) {
    let playPause = getPlayPauseElement(xulTab);

    if (!playPause) {
      let chromeDocument = xulTab.ownerDocument;
      let worker = workers[getTabId(xulTab)];

      playPause = chromeDocument.createElement("div");
      playPause.setAttribute("anonid", "play-pause");
      playPause.style.pointerEvents = "all";
      playPause.style.cursor = "default";
      playPause.style.marginRight = "3px";

      playPause.addEventListener("mousedown", function (event) {
        // Make sure it's a single LMB click.
        if (event.button != 0 || event.detail != 1) {
          return;
        }
        worker.port.emit("toggle");
        event.stopPropagation();
      }, true);

      let tabContent = chromeDocument.getAnonymousElementByAttribute(xulTab, "class", "tab-content");
      let tabLabel = getTabLabelElement(xulTab);
      if (tabLabel) {
        tabContent.insertBefore(playPause, tabLabel);
      } else {
        tabContent.appendChild(playPause);
      }

      worker.port.emit("query");
    }
  }

  function removePlayPauseSymbol(xulTab) {
    let playPause = getPlayPauseElement(xulTab);
    if (playPause) {
      playPause.remove();
    }
  }

  function stripSymbolsFromLabel(label) {
    let tokenArray = label.split(" ");
    for (let idx = 0; idx < tokenArray.length; idx++) {
      if (stripSymbols.indexOf(tokenArray[idx]) == -1) {
        return tokenArray.slice(idx).join(" ");
      }
    }
    return label;
  }

  function setTabLabelValueForTab(xulTab, value, shouldStrip) {
    let tabLabel = getTabLabelElement(xulTab);
    if (tabLabel) {
      if (shouldStrip) {
        value = stripSymbolsFromLabel(value);
      }
      tabLabel.value = value;
    }
  }

  function domAttrModifiedHandler(event) {
    if (event.attrName != "value") {
      return;
    }
    let xulTab = event.target;
    let playPause = getPlayPauseElement(xulTab);
    if (playPause) {
      setTabLabelValueForTab(xulTab, event.newValue, true);
    }
  }

  function tabMoveHandler(event) {
    let xulTab = event.target;
    setTabLabelValueForTab(xulTab, xulTab.label, true);
    addPlayPauseSymbol(xulTab);
  }

  function tabPinUnpinHandler(event) {
    let xulTab = event.target;
    let chromeDocument = xulTab.ownerDocument;

    let closeButton = chromeDocument.getAnonymousElementByAttribute(xulTab, "anonid", "close-button");
    if (!closeButton) {
      // Check if "Tab Mix Plus" Close button is present.
      closeButton = chromeDocument.getAnonymousElementByAttribute(xulTab, "anonid", "tmp-close-button");
    }
    if (!closeButton) {
      return;
    }
    if (xulTab.pinned) {
      closeButton.setAttribute("pinned", "true");
    } else {
      closeButton.removeAttribute("pinned");
    }
  }

  function addEventBindings(xulTab) {
    xulTab.addEventListener("DOMAttrModified", domAttrModifiedHandler, false);
    xulTab.addEventListener("TabMove", tabMoveHandler, false);
    xulTab.addEventListener("TabPinned", tabPinUnpinHandler, false);
    xulTab.addEventListener("TabUnpinned", tabPinUnpinHandler, false);
  }

  function removeEventBindings(xulTab) {
    xulTab.removeEventListener("DOMAttrModified", domAttrModifiedHandler, false);
    xulTab.removeEventListener("TabMove", tabMoveHandler, false);
    xulTab.removeEventListener("TabPinned", tabPinUnpinHandler, false);
    xulTab.removeEventListener("TabUnpinned", tabPinUnpinHandler, false);
  }

  function startListening(worker) {
    let sdkTab = worker.tab;
    let xulTab = viewFor(sdkTab);
    let id = sdkTab.id;

    workers[id] = worker;

    worker.port.once("init", function () {
      setTabLabelValueForTab(xulTab, xulTab.label, true);
      addPlayPauseSymbol(xulTab);
      addEventBindings(xulTab);
    });
    worker.port.on("paused", function (paused) {
      let playPause = getPlayPauseElement(xulTab);
      if (playPause) {
        playPause.innerHTML = (paused ? pauseSymbol : playSymbol);
      }
    });
    worker.on("detach", function () {
      removeEventBindings(xulTab);
      removePlayPauseSymbol(xulTab);
      setTabLabelValueForTab(xulTab, sdkTab.title, false);
      xulTab = null;
      delete workers[id];
    });
  }

  exports.main = function () {
    require("sdk/page-mod").PageMod({
      include: "*", // Match everything
      attachTo: ["existing", "top"],
      contentScriptFile: require("sdk/self").data.url("content-script.js"),
      onAttach: startListening
    });
  };
})();
