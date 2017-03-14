/* global Firebase, _ */
/* jshint strict: true */
/* jshint -W014 */

(function() {
'use strict';

/**
 * @ngdoc function
 * @name webClientApp.controller.TableCtrl
 * @description
 * # TableCtrl
 * Controller of the webClientApp
*/
angular
.module('webClientApp')
.controller('TableCtrl', TableCtrl)

TableCtrl.$inject = [
  '$scope',
  '$rootScope',
  '$timeout',
  '$stateParams',
  'Me',
  'Auth',
  'Nav',
  'FileFactory',
  'CardFactory',
  'TroopLogger',
  'UAParser',
  '$sessionStorage'
];
function TableCtrl(
  $scope,
  $rootScope,
  $timeout,
  $stateParams,
  Me,
  Auth,
  Nav,
  FileFactory,
  CardFactory,
  TroopLogger,
  UAParser,
  $sessionStorage
) {

  var logConfig = {
    slug: 'controller: TableCtrl - ',
    path: [ 'controllers', 'dashboard', 'board', 'Table.js']
  };

  var vm = this;
  vm.isSettingCardList = false;
  vm.loading = true;
  vm.dragDisabled = false;
  vm.cardCount = 0;
  vm.cardLists = [];
  vm.boardCards = Me.currentBoardCards;
  vm.tableViewArray = [];
  vm.tagRowArray = [];
  vm.sorted = [];
  vm.sortingColBy = '';
  vm.sortDirection = 'asc';
  vm.showHandles = true;
  vm.selectedTagName = 'tp-all';
  vm.tagFilteredCardsArray = [];
  vm.unWatchCurrentBoardCards = function() {};
  vm.trackAssets = {};
  vm.assets = [];

  vm.getTagRowArray = getTagRowArray;
  vm.sortColBy = sortColBy;
  vm.resetColSort = resetColSort;
  vm.navToDetailCard = navToDetailCard;
  vm.startWatching = startWatching;

  vm.filesAdded = filesAdded;
  vm.setAssetStyle = setAssetStyle;
  vm.createCard = createCard;
  vm.addAsset = addAsset;
  vm.onAssetProcessingComplete = onAssetProcessingComplete;
  vm.uploadFile = uploadFile;
  vm.drag = drag;


  vm.mobile = ('iOS' === UAParser.os.name) || ('Android' === UAParser.os.name);


  Auth.$loaded()
  .then(function() {
    TroopLogger.debug(logConfig, 'Auth.$loaded()');

    return Me.$doneRedirecting();
  })
  .catch(function(error) {

    TroopLogger.debug(logConfig, 'Auth.$loaded() - catch error');

    console.log(error)

    if ( error && error.code ) {

      switch (error.code) {

        case 'SIGNING_IN':
          // continue loading if signing in
          return this;
          break;
      }
    }

    // otherwise skip loading
    return $q.reject(error);
  })
  .then(function doneTryingToLoadTroop() {
    TroopLogger.debug(logConfig, 'doneTryingToLoadTroop()');

    return Me.$doneTryingToLoadTroop();
  })
  .then(function trooperLoaded() {
    TroopLogger.debug(logConfig, 'doneTryingToLoadTroop()');

    return Me.trooper.$loaded();
  })
  .then(function doneTryingToLoadTroopMember() {
    TroopLogger.debug(logConfig, 'doneTryingToLoadTroopMember()');

    return Me.$doneTryingToLoadTroopMember();
  })
  .then(function troopMemberLoaded() {
    TroopLogger.debug(logConfig, 'troopMemberLoaded()');

    return Me.troopMember.$loaded();
  })
  .then(function doneTryingToLoadTroop() {
    TroopLogger.debug(logConfig, 'doneTryingToLoadTroop()');

    return Me.$doneTryingToLoadTroop();
  })
  .then(function troopLoaded() {
    TroopLogger.debug(logConfig, 'troopLoaded()');

    return Me.troop.$loaded();
  })
  .then(function doneTryingToLoadBoard() {
    TroopLogger.debug(logConfig, 'doneTryingToLoadBoard()');

    if ( ( ! Me.currentBoard ) || Me.currentBoard.$id !==  $stateParams.boardId ) {

      Me.loadBoard(Me.troop.$id, $stateParams.boardId);
    }

    return Me.$doneTryingToLoadBoard();
  })
  .then(function currentBoardLoaded() {
    TroopLogger.debug(logConfig, 'currentBoardLoaded()');

    return Me.currentBoard.$loaded();
  })
  .then(function() {
    TroopLogger.debug(logConfig, 'currentBoardCards Loaded');
    TroopLogger.debug(logConfig, 'cardSortableOptions Set');

    var disabled = false;

    if (
      Me.troopMember.hasOwnProperty('boards')
      && Me.troopMember.boards.hasOwnProperty(Me.currentBoard.$id)
      && Me.troopMember.boards[Me.currentBoard.$id].permission !== 'admin'
    ) {
      disabled = true;
    }

    vm.cardSortableOptions = {
      disabled: disabled,
      delay: vm.mobile ? 100 : 0,
      dropSort: false,
      dropAdd: false,
      dropRemove: false,
      dropRevert: true,
      group: 'card-list',
      draggable: '.card-row',
      handle: '.sort-handle',
      scrollSensitivity: 50,
      scrollSpeed: 20,
      onStart: function(evt) {
        vm.dragDisabled = true;
      },
      onEnd: function (/**Event*/evt) {

        $(evt.from).removeClass('moving-card')
        var cardId = evt.item.getAttribute('data-card-id');
        var cardObj = Me.currentBoardCards.$getRecord(cardId);

        var prevCardIndex = evt.newIndex - 1;
        var nextCardIndex = evt.newIndex + 1;

        var prevCardObj = evt.models[evt.newIndex - 1];
        var nextCardObj = evt.models[evt.newIndex + 1];

        if (prevCardObj && nextCardObj) {
          // in between
          cardObj.order = prevCardObj.order - ( (prevCardObj.order - nextCardObj.order) / 2.0 );
        }
        else if (prevCardObj) {
          // end
          cardObj.order = prevCardObj.order / 2.0;
        }
        else if (nextCardObj) {
          // beginning
          cardObj.order = nextCardObj.order + 1;
        }

        var data = {
          oldIndex: evt.oldIndex,
          newIndex: evt.newIndex,
          fromEl: evt.from,
          toEl: evt.to,
          itemEl: evt.item,
          cardId: cardId,
          cardObj: cardObj,
          prevCardIndex: prevCardIndex,
          prevCardObj: prevCardObj,
          nextCardIndex: nextCardIndex,
          nextCardObj: nextCardObj
        };

        TroopLogger.debug(logConfig, 'movedWithinOtherCardsList()' + data);

        vm.colToggle = 'unset';

        updateCardOrder(data);
        saveCard(data);
        vm.dragDisabled = false;

      }
    };

    return Me.currentBoardCards.$loaded();
  })
  .then(function() {

    vm.loading = false;

    startWatching();
    getTableViewArray();

    if ( Me.troopMember.troopPermission !== 'guest'
       && ( ( ! Me.currentBoard.readOnly )
       || ( Me.troopMember.boards[Me.currentBoard.$id].permission === 'admin' ) ) )
       {
         vm.dragDisabled = false;
       }

    else
      {
        vm.dragDisabled = true;
      }


  });

  $rootScope.$broadcast('table-view-loaded');

  $scope.$on('tag-filter-apply', function(event, selectedTagName) {

    vm.selectedTagName = selectedTagName;
  });

  return;


  function startWatching() {

    vm.unWatchCurrentBoardCards = Me.currentBoardCards.$watch(function(event) {

      var modifiedCard = Me.currentBoardCards.$getRecord(event.key);

      switch (event.event) {
        case 'child_changed':

          var tableViewCard = _.findWhere(vm.tableViewArray, { '$id': event.key });

          tableViewCard.iconAsset = modifiedCard.orderedAssets[0];
          tableViewCard.cardName = modifiedCard.cardName;
          tableViewCard.order = modifiedCard.order;
          tableViewCard.tags = modifiedCard.tags;

          TroopLogger.debug(logConfig, event, 'card_changed');
          break;
        case 'child_added':
          // New Card added

          if ( modifiedCard ) {
            addCardToTableViewArray(modifiedCard);
          }

          reSort();

          TroopLogger.debug(logConfig, event, 'card_added');
          break;
      }
    });

  };

  function reSort() {

    switch ( vm.sortingColBy ) {

      case '':
        resetColSort();
        break;

      case 'iconAsset':
        sortColByFileType();
        break;

      case 'createdAt':
        sortColByDate();
        break;

      case 'cardName':
        sortColByTitle();
        break;

      case 'createdByMemberId':
        sortColByAuthor();
        break;

      default:
        // handle tags
        sortColByTag( vm.sortingColBy );
        break;
    }
  }

  function updateCardOrder(data) {

    TroopLogger.debug(logConfig, 'updateCardOrder() called');
    if (data.prevCardObj && data.nextCardObj) {

      //dropped in between
      if (data.prevCardObj.order === data.nextCardObj.order) {

        //set to same order as prev and next
        data.nextCardObj.order = data.prevCardObj.order;
      }
      else if (
        data.cardObj.order >= data.prevCardObj.order
        || data.cardObj.order <= data.nextCardObj.order
      ) {

        //set order below prevCard order
        var orderDiff = data.prevCardObj.order - data.nextCardObj.order;

        if ( orderDiff > 1 ) {
          data.cardObj.order = data.prevCardObj.order - 1;
        }
        else {
          data.cardObj.order = data.prevCardObj.order - (orderDiff / 2.0);
        }
      }
      else {
        //order should already be in between
      }

    }
    else if (
      data.prevCardObj
      && ( data.cardObj.order > data.prevCardObj.order )
    ) {

      //dropped on bottom
      if (data.prevCardObj.order > 1) {
        data.cardObj.order = data.prevCardObj.order - 1;
      }
      else {
        data.cardObj.order = data.prevCardObj.order / 2.0;
      }
    }
    else if (
      data.nextCardObj
      && ( data.cardObj.order <= data.nextCardObj.order )
    ) {

      //dropped on top
      data.cardObj.order = data.nextCardObj.order + 1;
    }
    else {

      //no change to order needed
    }
  }

  function saveCard(data) {

    TroopLogger.debug(logConfig, 'data passed into saveCard()', $.extend({}, data));
    TroopLogger.debug(logConfig, 'saveCard()');

    Me.currentBoardCards.$save(data.cardObj).then(function() {
      updateCardOrder(data);
    });

  }

  function navToDetailCard(cardId) {

    Nav.toBoardCard(
      Me.troop.public,
      Me.troopMember.troopPermission !== 'guest',
      Me.currentBoard.$id,
      cardId
    );

  }

  // function setCardArrayItem(card) {
  //
  //   var tmpCard = {
  //     createdByMemberId: card.createdByMemberId,
  //     iconAsset: card.orderedAssets[0],
  //     troopId: card.troopId,
  //     cardName: card.cardName,
  //     boardId: card.boardId,
  //     '$id': card.$id,
  //     order: card.order,
  //     tags: card.tags,
  //     createdAt: card.createdAt
  //   };
  //
  //   return tmpCard;
  //
  // }

  function addCardToTableViewArray(card) {
    var tmpCard = {
      createdByMemberId: card.createdByMemberId,
      iconAsset: card.orderedAssets[0],
      troopId: card.troopId,
      cardName: card.cardName,
      boardId: card.boardId,
      '$id': card.$id,
      order: card.order,
      tags: card.tags,
      createdAt: card.createdAt
    };

    _.each(Me.currentBoard.tagNames, function(tag, tagName) {

      if (

        card.tags
        && card.tags.hasOwnProperty(tagName)

      ) {
        tmpCard[tagName] = card.tags[tagName];
      }
      else {
        tmpCard[tagName] = null;
      }

    });

    vm.tableViewArray.push(tmpCard);

  }

  // remove setting of tmpCard out of this method
  function getTableViewArray() {

    _.each(Me.currentBoardCards, function(card){

      addCardToTableViewArray(card);
    });

    TroopLogger.debug(logConfig, ' get vm.tableViewArray: ' + $.extend({}, vm.tableViewArray));

    return vm.tableViewArray;

  }

  function getTagRowArray() {

    _.each(Me.currentBoardCards, function(card){

        var tmpTag = {
          tagName: card.tag
        };

      vm.tagRowArray.push(tmpTag);

    });

    TroopLogger.debug(logConfig, ' get vm.tagRowArray: ' + $.extend({}, vm.tagRowArray));

  }

  function sortColByAuthor() {

    TroopLogger.debug(logConfig, ' sortColByAuthor() called');

    vm.tableViewArray.sort(function(a, b) {

      var aMember = Me.troopMembers.$getRecord(a.createdByMemberId);
      var bMember = Me.troopMembers.$getRecord(b.createdByMemberId);

      return naturalSort(
        aMember.name,
        bMember.name,
        vm.sortDirection
      );

    });

  }

  function sortColByDate() {

    TroopLogger.debug(logConfig, ' sortColByDate() called');

    if (  vm.sortDirection === 'asc'  ) {

      vm.tableViewArray.sort(function(a,b) {

        if ( a.createdAt < b.createdAt ) {
          return -1;
        }
        if (a.createdAt > b.createdAt ) {
          return 1;
        }
        return 0;
      });
    }
    else {

      vm.tableViewArray.sort(function(a,b) {

        if ( b.createdAt < a.createdAt ) {
          return -1;
        }
        if (b.createdAt > a.createdAt ) {
          return 1;
        }
        return 0;
      });

    }

  }

  function sortColByTitle() {

    TroopLogger.debug(logConfig, ' sortColByTitle() called');

    vm.tableViewArray.sort(function(a,b) {

      return naturalSort(
        a.cardName.toLowerCase(),
        b.cardName.toLowerCase(),
        vm.sortDirection
      );
    });

  }

  function sortColByFileType() {

    TroopLogger.debug(logConfig, ' sortColByFileType() called');

    vm.tableViewArray.sort(function(a,b) {

      var aAsset = Me.currentBoardAssets.$getRecord(a.iconAsset);
      var bAsset = Me.currentBoardAssets.$getRecord(b.iconAsset);

      return naturalSort(
        FileFactory.fileTypeClass(aAsset.mimeType).toLowerCase(),
        FileFactory.fileTypeClass(bAsset.mimeType).toLowerCase(),
        vm.sortDirection
      );
    });

  }

  function sortColByTag(tagName) {

    TroopLogger.debug(logConfig, ' sortColByTag() called');

    vm.tableViewArray.sort(function(a,b) {

      var aTagValue = '';
      var bTagValue = '';

      if (
        a.tags
        && a.tags.hasOwnProperty(tagName)
      ) {
        aTagValue = a.tags[tagName].toLowerCase();
      }

      if (
        b.tags
        && b.tags.hasOwnProperty(tagName)
      ) {
        bTagValue = b.tags[tagName].toLowerCase();
      }

      return naturalSort(aTagValue, bTagValue, vm.sortDirection);
    });

  }

  function resetColSort() {
    vm.showHandles = true;
    vm.sortingColBy = '';

    TroopLogger.debug(logConfig, ' resetColSort() called');

    vm.tableViewArray.sort(function(a,b) {

      if ( b.order < a.order ) {
        return -1;
      }
      if (b.order > a.order ) {
        return 1;
      }
      return 0;
    });

  }

  function naturalSort(a, b, direction) {

    var re = /(^([+\-]?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?(?=\D|\s|$))|^0x[\da-fA-F]+$|\d+)/g,
        sre = /^\s+|\s+$/g, // trim pre-post whitespace
        snre = /\s+/g, // normalize all whitespace to single ' ' character
        dre = /(^([\w ]+,?[\w ]+)?[\w ]+,?[\w ]+\d+:\d+(:\d+)?[\w ]?|^\d{1,4}[\/\-]\d{1,4}[\/\-]\d{1,4}|^\w+, \w+ \d+, \d{4})/,
        hre = /^0x[0-9a-f]+$/i,
        ore = /^0/,
        i = function(s) {
          return (naturalSort.insensitive && ('' + s).toLowerCase() || '' + s).replace(sre, '');
        },
        // convert all to strings strip whitespace
        x = i(a),
        y = i(b),
        // chunk/tokenize
        xN = x.replace(re, '\0$1\0').replace(/\0$/, '').replace(/^\0/, '').split('\0'),
        yN = y.replace(re, '\0$1\0').replace(/\0$/, '').replace(/^\0/, '').split('\0'),
        // numeric, hex or date detection
        xD = parseInt(x.match(hre), 16) || (xN.length !== 1 && Date.parse(x)),
        yD = parseInt(y.match(hre), 16) || xD && y.match(dre) && Date.parse(y) || null,
        normChunk = function(s, l) {
          // normalize spaces; find floats not starting with '0', string or 0 if not defined (Clint Priest)
          return (!s.match(ore) || l == 1) && parseFloat(s) || s.replace(snre, ' ').replace(sre, '') || 0;
        },
        oFxNcL, oFyNcL;

    // first try and sort Hex codes or Dates
    if (yD) {

        if (xD < yD) {

          return -1;
        }
        else if (xD > yD) {

          return 1;
        }

    }
    // natural sorting through split numeric strings and default strings
    for (var cLoc = 0, xNl = xN.length, yNl = yN.length, numS = Math.max(xNl, yNl); cLoc < numS; cLoc++) {
      oFxNcL = normChunk(xN[cLoc] || '', xNl);
      oFyNcL = normChunk(yN[cLoc] || '', yNl);
      // handle numeric vs string comparison - number < string - (Kyle Adams)
      if (isNaN(oFxNcL) !== isNaN(oFyNcL)) {

        return isNaN(oFxNcL) ? 1 : -1;
      }
      // if unicode use locale comparison
      if (/[^\x00-\x80]/.test(oFxNcL + oFyNcL) && oFxNcL.localeCompare) {

        var comp = oFxNcL.localeCompare(oFyNcL);
        return comp / Math.abs(comp);
      }

      if ( direction == 'asc'  ) {

        if (oFxNcL < oFyNcL) {

          return -1;
        }
        else if (oFxNcL > oFyNcL) {

          return 1;
        }
      }
      else if ( direction == 'desc'    ) {

        if (oFxNcL > oFyNcL) {

          return -1;
        }
        else if (oFxNcL < oFyNcL) {

          return 1;
        }

      }

    }

  }

  function sortColBy(property) {

    TroopLogger.debug(logConfig, ' sortColBy() called with arg: ' + property);

    if ( vm.sortingColBy === property ) {

      vm.sortDirection = ( vm.sortDirection === 'asc' ) ? 'desc' : 'asc';
    }

    vm.showHandles = false;

    vm.sortingColBy = property;

    reSort();
  }

  function drag($isDragging, $class, $event) {

     $("body > .wrapper > main > section > main > .wrapper > .drag-overlay > .background-box ").on("dragover", function() {
       $("body > .wrapper > main > section > main > .wrapper > .drag-overlay ").addClass("drag-animate");
     })
     $("body > .wrapper > main > section > main > .wrapper > .drag-overlay > .background-box ").on("dragleave", function() {
       $("body > .wrapper > main > section > main > .wrapper > .drag-overlay ").removeClass("drag-animate");
     })

  }

  function filesAdded($files, $file, $event) {
    $("body > .wrapper > main > section > main > .wrapper > .drag-overlay ").removeClass("drag-animate");
    if (vm.maxOrder === -Infinity) {
      vm.maxOrder = 0;
    }

    _.each($files, function(file) {

      vm.maxOrder += 1;

      var asset = {
        order: vm.maxOrder,
        file: file
      };

      vm.assets.splice(0, 0, asset);

      if ( ! FileFactory.isImageFileType(file.type) ) {

        vm.setAssetStyle(asset);
      }
      else {

        var reader  = new FileReader();
        reader.addEventListener('load', function() {

          $timeout(function() {

            asset.base64 = reader.result;

            vm.setAssetStyle(asset);
          }, 0);

        }, false);

        reader.readAsDataURL(file);
      }
      vm.createCard(asset);

    });



  };

  function setAssetStyle(asset) {

    var imageUrl;
    var mimeType;

    if ( asset.file ) {

      mimeType = asset.file.type;

    }
    else {

      mimeType = asset.mimeType;
    }

    if ( FileFactory.isImageFileType(mimeType) ) {

      if ( asset.file ) {

        imageUrl = asset.base64;
      }
      else {

        imageUrl = asset.metaData.mediumUrl;
      }
    }
    else if ( asset.image ) {

      imageUrl = asset.image.url;
    }
    else {

      var fileType = FileFactory.fileTypeClass(mimeType);

      imageUrl = '/images/svg/icons/' + fileType + '.svg';
    }

    asset.style = {
      'background-image': 'url(' + imageUrl + ')'
    };

  };

  function createCard(asset) {

    var order = 1;

    if (Me.currentBoardCards.length > 0) {
      order = Me.currentBoardCards[0].order + 1;
    }

    CardFactory.create({
      board: Me.currentBoard,
      troopId: Me.troop.$id,
      order: order,
      cardName: asset.file.name,
      description: '',
      tagString: '',
      createdByMemberId: Me.troopMember.$id
    })
    .then(function(cardRef) {
      vm.cardRef = cardRef;
      vm.addAsset(asset);
    })
    .catch(function(error) {
      console.log(error);
    });
  };

  function addAsset(asset) {
    vm.uploadFile(asset);

    vm.onAssetProcessingComplete();

  };

  function onAssetProcessingComplete() {

    var allDone = true;

    if (!_.isEmpty(vm.trackAssets)) {
      allDone = _.reduce(
        _.values(vm.trackAssets),
        function(combined, nextValue) {
          return combined && nextValue;
        }
      );
    }

    if (allDone) {

      vm.origCard = $scope.card;

      $scope.isSaving = false;

    }

  };

  function uploadFile(asset) {

    if (asset && asset.file) {
      var $file = asset.file;

      vm.trackAssets[$file.name] = false;

      var metaData = {};
      var mimeType = $file.type;

      if ( ! mimeType ) {
        var ext = $file.name.split('.').pop();
        mimeType = MIME_TYPES[ext] || MIME_TYPES['_default'];
      }
      CardFactory.uploadAsset({
        $file: $file,
        troopId: Me.troop.$id,
        cardId: vm.cardRef.key,
        boardId: Me.currentBoard.$id,
        order: 0,
        mimeType: mimeType,
        fileName: $file.name,
        metaData: metaData,
        createdByUserId: Me.trooper.$id
      })
      .then(function(resp) {

        asset.assetId = resp.assetRef.key;
        asset.troopId = Me.troop.$id;

        asset.file.state = 'uploading';
        asset.progress = 1;

        resp.uploader.then(
          function(uploaderResp) {
            // upload complete
            asset.file.state = 'complete';
          },
          function(uploaderResp) {
            // error

          },
          function(evt) {
            // upload notify
            //asset.progress = parseInt(100.0 * evt.loaded / evt.total);
          }
        );

        resp.assetRef.child('/upload/state').on('value', function(snap) {

          if ( snap.exists() ) {

            var state = snap.val();

            if (
              state
              && 'finished' === state
            ) {
              vm.trackAssets[$file.name] = true;
              vm.onAssetProcessingComplete();
            }
          }
        });
      });



    }
  };

  function moveCard(data) {
    TroopLogger.debug(logConfig, '' + data);

    updateCardOrder(data);
    saveCard(data);

  }


}

})();
