// ==UserScript==
// @name         Variety eggs
// @match        https://pokefarm.com/*
// @icon         https://pokefarm.com/favicon.ico
// @grant        none
// @require      http://ajax.googleapis.com/ajax/libs/jquery/1.11.2/jquery.min.js
// @require      https://raw.githubusercontent.com/tarashia/OtherPFQ/refs/heads/main/pfq-ajax.min.js
// @require      https://raw.githubusercontent.com/pokefarm-com/userscripts/refs/heads/main/lib/persistent-config.js
// ==/UserScript==

/*

Author: Mirzam
Keeps track of eggs adopted during the hatch variety eggs tournament.
Report bugs and issues in my main code sharing thread: https://pfq.link/~-HvB

Image classes for custom CSS:
.varietyUsed - an egg already used, default set to partially transparent
.varietyNew - an egg that hasn't been used yet, default set to a blue border
.varietyExclude - defaults to just blocking the other styles, but you can set your own using this class

Requires are only for local testing using Greasemonkey, and provide required library functions

*/

class VarietyEggs {
  // Default styles for this script - overwrite with skin or QoL styling
  static newStyle = 'border: 3px solid blue;';
  static usedStyle = 'opacity: 0.3;';
  static wikiPage = 'https://pokefarm.wiki/List_of_Pok%C3%A9mon';

  constructor(isLab, isShelter, config) {
    this.isLab = isLab;
    this.isShelter = isShelter;
    this.config = config;
    this.usedEggs = [];
    this.excludedEggs = [];
  }

  run() {
    this.fetchData();
    this.setupUI();
  }

  // Add user interface elements and styling, and prepare mutation observers
  setupUI() {
    var styleNode = document.createElement('style');
    styleNode.innerText = 'img.varietyNew:not(.varietyExclude) { '+VarietyEggs.newStyle+' } img.varietyUsed:not(.varietyExclude) { '+VarietyEggs.usedStyle+' }';
    document.querySelector('body').append(styleNode);
    let buttonContainer = document.createElement('div');
    buttonContainer.id = 'varietyBtnContainer';
    var infoText = document.createElement('p');
    infoText.innerText = 'Variety eggs helper controls';
    infoText.style = 'font-weight: bold;'
    buttonContainer.append(infoText);
    buttonContainer.style = 'text-align: center;';

    // Add control buttons
    this.clearButton = document.createElement('button');
    this.clearButton.innerText = 'Clear data';
    this.clearButton.onclick = ()=>{this.clearData()};
    buttonContainer.append(this.clearButton);
  
    this.addButton = document.createElement('button');
    this.addButton.innerText = 'Add/exclude egg';
    this.addButton.onclick = ()=>{this.addData()};
    this.addButton.style = 'margin-left: 15px;';
    buttonContainer.append(this.addButton);

    this.syncButton = document.createElement('button');
    this.syncButton.innerText = 'Sync data';
    this.syncButton.onclick = ()=>{this.confirmSync()};
    this.syncButton.style = 'margin-left: 15px;';
    buttonContainer.append(this.syncButton);

  // Add mutation watchers based on location
    if(this.isLab) {
      let labMO = new MutationObserver(()=>{this.areaWatcher()});
      let labAdoptMO = new MutationObserver(()=>{this.labAdoptWatch()});
      labMO.observe(document.getElementById('egglist'), { childList: true, subtree: true });
      labAdoptMO.observe(document.body, { childList: true, subtree: false });
      document.querySelector('#eggsbox360').append(buttonContainer);
    }
    
    if(this.isShelter) {
      let shelterMO = new MutationObserver(()=>{this.areaWatcher()});
      let shelterAdoptMO = new MutationObserver(()=>{this.shelterAdoptWatch()});
      shelterMO.observe(document.getElementById('shelterarea'), { childList: true, subtree: false });
      shelterAdoptMO.observe(document.body, { childList: true, subtree: false });
      // try to match skin color for UI elements
      try {
        const bgColor = window.getComputedStyle(document.querySelector('#sheltercommands')).getPropertyValue('background-color');
        buttonContainer.style.backgroundColor = bgColor;
      } catch(e) {
        console.warn('Failed to set button container background');
        console.warn(e);
      }
      buttonContainer.style.borderRadius = '0 0 6px 6px';
      buttonContainer.style.paddingTop = '10px';
      buttonContainer.style.paddingBottom = '5px';
      document.querySelector('#shelter').append(buttonContainer);
    }
  }
  
  // watch for reloads, etc, and re-run required steps each time
  areaWatcher() {
    // buttons get disabled, so re-enable them
    this.clearButton.removeAttribute('disabled');
    this.addButton.removeAttribute('disabled');
    this.syncButton.removeAttribute('disabled');
    // remove old classes, if they still exist (lab mostly)
    var oldEggs = document.querySelectorAll('.varietyUsed, .varietyExclude');
    for(const egg of oldEggs) {
      egg.classList.remove('varietyUsed');
      egg.classList.remove('varietyExclude');
    }
    this.highlightEggs();
  }

  // Detect eggs adopted from lab
  labAdoptWatch() {
    var eggPreview = document.getElementById('eggpreview');
    if(eggPreview) {
      var eggURL = eggPreview.querySelector('img').src;
      eggPreview.nextElementSibling.addEventListener('click', () => {
        this.storeEgg(eggURL);
      });
    }
  }

  // Detect eggs adopted from shelter
  shelterAdoptWatch() {
    var eggPreview = document.querySelector('.dialog .adoptme .plateform .egg');
    if(eggPreview) {
      document.getElementById('adoptloadbox').nextElementSibling.addEventListener('click', () => {
        this.storeEgg(eggPreview.style['background-image']);
      });
    }
  }

  // apply the script classes to each egg on the page (usually called by mutation observers)
  highlightEggs() {
    console.log('Highlighting eggs...');
    var querySelector = '#shelterarea .pokemon[data-stage="egg"] img.big';
    if(this.isLab) {
      querySelector = '#egglist > div > img';
    }
  
    var eggs = document.querySelectorAll(querySelector);
    for(const egg of eggs) {
      const eggCode = VarietyEggs.convertURL(egg.src);
      // if in exclude list, always check this first
      // also remove old classes in case user has just done a manual add or clear
      if(this.excludedEggs.includes(eggCode)) { 
        egg.classList.add('varietyExclude');
        egg.classList.remove('varietyNew');
        egg.classList.remove('varietyUsed');
      }
       // if in used list
      else if(this.usedEggs.includes(eggCode)) {
        egg.classList.add('varietyUsed'); 
        egg.classList.remove('varietyNew');
        egg.classList.remove('varietyExclude');
      }
      // not in either list = new
      else {
        egg.classList.add('varietyNew');
        egg.classList.remove('varietyExclude');
        egg.classList.remove('varietyUsed');
      }
    }
  }

  // convert a full img src URL to the shortened form used in this script's storage & compare
  static convertURL(imgSrc) {
    const imgLoc = imgSrc.indexOf('/img/');
    const pngLoc = imgSrc.indexOf('.png');
    return imgSrc.substring(imgLoc,pngLoc+4);
  }

  // store a specified egg
  storeEgg(imgSrc,exclude=false) {
    const eggID = VarietyEggs.convertURL(imgSrc);
    if(!exclude) {
      if(!this.usedEggs.includes(eggID)) {
        console.log('Storing new egg: '+eggID);
        this.usedEggs.push(eggID);
        this.highlightEggs();
        this.storeData();
      }
      else {
        console.log('Did not store repeat used egg: '+eggID);
      }
    }
    else {
      if(!this.excludedEggs.includes(eggID)) {
        console.log('Storing excluded egg: '+eggID);
        this.excludedEggs.push(eggID);
        this.highlightEggs();
        this.storeData();
      }
      else {
        console.log('Did not store repeat exclude egg: '+eggID);
      }
    }
  }

  // Clear stored data
  clearData() {
    var content = '<p>Are you sure you want to clear your data? You <b>cannot</b> undo this action!</p><p>If you not clearing all data, make sure you have synced first to avoid overwriting remote data.</p>';
    content += '<div style="margin-bottom: 5px;"><input type="radio" id="clearUsedEggs" name="clearType" checked> <label for="clearUsedEggs">Used eggs only</label></div>';
    content += '<div style="margin-bottom: 5px;"><input type="radio" id="clearExcludedEggs" name="clearType" > <label for="clearExcludedEggs">Excluded eggs only</label></div>';
    content += '<div><input type="radio" id="clearAll" name="clearType"> <label for="clearAll">All data</label></div>';
    DialogBox.openDialogWithAction(content, 'Clear egg data', async ()=>{

      if(document.getElementById('clearUsedEggs').checked) {
        this.usedEggs = [];
      }
      else if(document.getElementById('clearExcludedEggs').checked) {
        this.excludedEggs = [];
      }
      else {
        this.usedEggs = [];
        this.excludedEggs = [];
      }
      this.storeData();
      this.highlightEggs();
      // track remote sync
      DialogBox.closeDialog();
      DialogBox.openDialog('<p>Clearing egg data, please wait...</p>', 'Clear egg data');
      await this.config.persist();
      DialogBox.closeDialog();
      DialogBox.openDialog('<p>Data cleared</p>', 'Clear egg data');

    }, 'Yes, clear data', 'Cancel');
  }

  // Manually add data
  addData() {
    var content = '<p>Enter an image code. Example: c/0/7</p>';
    content += '<p><a href="'+VarietyEggs.wikiPage+'" target="_blank">Wiki page with all egg codes</a></p>';
    content += '<div style="margin-bottom: 5px;"><input id="addExcludeCode" type="text" style="width: 100%; box-sizing: border-box;"></input></div>';
    content += '<div style="margin-bottom: 5px;"><input type="radio" id="addUsedEgg" name="manualEntry" checked> <label for="addUsedEgg">Add used egg</label></div>';
    content += '<div><input type="radio" id="addExcludedEgg" name="manualEntry"> <label for="addExcludedEgg">Exclude egg</label></div>';
    DialogBox.openDialogWithAction(content, 'Manual add/exclude egg', ()=>{

      var eggCode = document.getElementById('addExcludeCode').value;
      if(!eggCode.match('^[a-z0-9](\/[a-z0-9])+$')) {
        alert('Bad code format. Please try again.');
        return;
      }
      if(document.getElementById('addUsedEgg').checked) {
        this.storeEgg('/img/pkmn/'+eggCode+'.png');
      }
      else if(document.getElementById('addExcludedEgg').checked) {
        this.storeEgg('/img/pkmn/'+eggCode+'.png',true);
      }
      DialogBox.closeDialog();

    }, 'Add egg', 'Cancel');
  }

  // Sync persistent data, with UI feedback
  confirmSync() {
    var content = '<p>Sync your data to your on-site notepad so it can be used on other devices. The list of used/excluded eggs will be merged with any existing data in your notepad.</p>';
    DialogBox.openDialogWithAction(content, 'Sync egg data', async ()=>{

      // track progress of sync
      DialogBox.closeDialog();
      DialogBox.openDialog('<p>Syncing egg data, please wait...</p>', 'Sync egg data');
      await this.syncData();
      DialogBox.closeDialog();
      DialogBox.openDialog('<p>Data sync done</p>', 'Sync egg data');

    }, 'Sync now', 'Cancel');
  }

  // Persistent storage interface
  storeData() {
    this.config.set('UsedEggs', this.usedEggs);
    this.config.set('ExcludedEggs', this.excludedEggs);
  }
  fetchData() {
    this.usedEggs = this.config.get('UsedEggs');
    this.excludedEggs = this.config.get('ExcludedEggs');
    if(!this.usedEggs) {
      console.log('No used egg data fetched');
      this.usedEggs = [];
    }
    if(!this.excludedEggs) {
      console.log('No excluded egg data fetched');
      this.excludedEggs = [];
    }
    console.log('Fetched egg data: "'+JSON.stringify(this.usedEggs)+'" , "'+JSON.stringify(this.excludedEggs)+'"'); //TODO remove
  }
  // Merge the local and remote data, then push the combined data set to the remote storage
  async syncData() {
    // get remote data, overwriting the data in localStorage but *not* the data in this class
    await this.config.sync();
    const remoteUsed = this.config.get('UsedEggs');
    const remoteExcluded = this.config.get('ExcludedEggs');
    console.log('Fetched sync data: "'+JSON.stringify(remoteUsed)+'" , "'+JSON.stringify(remoteExcluded)+'"'); // TODO remove
    // the egg store function already checks for duplicates, so just pass all the remote eggs to it to update the class data
    if(remoteUsed) {
      for(const rEgg of remoteUsed) {
        console.log('Storing remote used egg: '+rEgg); // TODO remove
        this.storeEgg(rEgg, false);
      }
    }
    if(remoteExcluded) {
      for(const rEgg of remoteExcluded) {
        console.log('Storing remote excluded egg: '+rEgg); // TODO remove
        this.storeEgg(rEgg, true);
      }
    }
    // copy the updated class data to localStorage
    this.storeData();
    // push the localStorage data to persistent storage
    this.config.persist();
  }
}

class DialogBox {
  // returns an object containing the dialog, contents, and footer for further processing
  static openDialog(content, header, closeText='Close') {
    var dialog = document.createElement('div');
    dialog.classList = 'dialog top';
    var dialogDiv1 = document.createElement('div');
    var dialogDiv2 = document.createElement('div');
    var dialogDiv3 = document.createElement('div');
    var dialogHeader = document.createElement('h3');
    var dialogContent = document.createElement('div');
    var dialogFooter = document.createElement('div');
    var closeBtn = document.createElement('button');
    closeBtn.setAttribute('type','button');
    closeBtn.style = 'float:right;margin:8px;';
    closeBtn.innerText = closeText;
    closeBtn.onclick = function() {
      DialogBox.closeDialog();
    }
    dialog.classList.add('dialog');
    dialog.appendChild(dialogDiv1);
    dialogDiv1.appendChild(dialogDiv2);
    dialogDiv2.appendChild(dialogDiv3);
    dialogHeader.innerText = header;
    dialogDiv3.appendChild(dialogHeader);
    dialogContent.innerHTML = content;
    dialogContent.style = 'padding: 10px;';
    dialogDiv3.appendChild(dialogContent);
    dialogDiv3.appendChild(dialogFooter);
    dialogFooter.appendChild(closeBtn);
    var body = document.getElementsByTagName('body')[0];
    body.prepend(dialog);
    var core = document.getElementById('core');
    core.classList.add('scrolllock');
    return {
      'dialog': dialog,
      'contents': dialogContent,
      'footer': dialogFooter
    };
  }
  // open a dialog with an extra action button - action must be a function
  static openDialogWithAction(content, header, action, actionText, closeText='Close') {
    var dialog = this.openDialog(content, header, closeText);
    if(action && typeof action === 'function') {
      var actionBtn = document.createElement('button');
      actionBtn.setAttribute('type','button');
      actionBtn.style = 'float:right;margin:8px;';
      actionBtn.innerText = actionText;
      actionBtn.onclick = action;
      dialog.footer.appendChild(actionBtn);
    }
    else {
      console.warn('No action or action not a function: '+typeof action);
    }
    return dialog;
  }
  // close any open dialogs
  static closeDialog() {
    const dialogs = document.getElementsByClassName('dialog');
    for(const dialog of dialogs) {
      dialog.remove();
    }
    const core = document.getElementById('core');
    core.classList.remove('scrolllock');
  }
}

(async function() {
  'use strict';
  const scriptName = 'variety-eggs';
  
  // detect if this is a supported page
  const currentURL = new URL(window.location);
  const isLab = currentURL.pathname == '/lab';
  const isShelter = currentURL.pathname == '/shelter';

  if(isLab || isShelter) {
    const config = await (new PersistentConfig(scriptName)).ready;
    const vEggs = new VarietyEggs(isLab, isShelter, config);
    vEggs.run();
  }
})();
