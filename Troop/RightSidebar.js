'use strict';

/**
 * @ngdoc function
 * @name webClientApp.controller:BoardRightSidebarCtrl
 * @description
 * # BoardRightSidebarCtrl
 * Controller of the webClientApp
 */
angular
  .module('webClientApp')
  .controller('BoardRightSidebarCtrl', BoardRightSidebarCtrl);

  BoardRightSidebarCtrl.$inject = [
    '$rootScope',
    '$scope',
    '$state',
    '$stateParams',
    '$sessionStorage',
    '$timeout',
    '$q',
    'Auth',
    'Me',
    'Nav',
    'Ref',
    '$firebaseArray',
    'BoardFactory',
    'FileFactory',
    'ModalService',
    'TroopMemberFactory',
    'TroopLogger',
    'DEMO_TROOP_ID',
    'HELP_TROOP_ID',
    'SecurityFactory',
    'CardFactory'
  ];

  function BoardRightSidebarCtrl(
    $rootScope,
    $scope,
    $state,
    $stateParams,
    $sessionStorage,
    $timeout,
    $q,
    Auth,
    Me,
    Nav,
    Ref,
    $firebaseArray,
    BoardFactory,
    FileFactory,
    ModalService,
    TroopMemberFactory,
    TroopLogger,
    DEMO_TROOP_ID,
    HELP_TROOP_ID,
    SecurityFactory,
    CardFactory
  ) {

    var logConfig = {
      slug: 'controller: BoardRightSidebarCtrl - ',
      path: [ 'controllers', 'dashboard', 'board', 'RightSidebar.js']
    };


    var that = this;
    this.prevBoardId = null;

    $scope.Me = Me;
    $scope.isLoadingMembers = true;
    $scope.isLoadingAssets = true;
    $scope.isLoadingTags = false;
    $scope.detailCardId = null;
    $scope.step = null;
    $scope.assetSizes = {};
    $scope.membersDisplayCheck = SecurityFactory.membersDisplayCheck;
    $scope.assets = [];
    $scope.members = [];
    $scope.helpTroopId = HELP_TROOP_ID;
    $scope.toggleTagChange = {};
    $scope.changeTagInput = {};

    $scope.memberMenus = {};
    $scope.cardListsMap = {};
    $scope.$sess = $sessionStorage;
    $scope.canDisplayMembers = false;

    $scope.isCardDetail = ($state.current.name === 'home.dashboard.board.card');
    $scope.isDocumentView = ($state.current.name === 'home.dashboard.board.document');

    $scope.showMembers = ( SecurityFactory.membersDisplayCheck() && (Me.troop.$id !== $scope.helpTroopId) );

    $scope.selectedSection = $scope.showMembers ? 'board-members' :
      ($stateParams.selectedTagName && !$scope.isCardDetail) ? 'assets' : 'tags';

    $scope.$on('$stateChangeSuccess', function(event, toState) {
      $scope.isCardDetail = (toState.name === 'home.dashboard.board.card');
      $scope.isDocumentView = (toState.name === 'home.dashboard.board.document');

      $scope.selectedSection = $scope.showMembers ? 'board-members' :
        ($stateParams.selectedTagName && !$scope.isCardDetail) ? 'assets' : 'tags';
    });

    this.setMembers = function() {

      $scope.members = [];

      Me.$doneTryingToLoadBoard()
        .then(function() {

          if ( ! Me.currentBoard ) {
            return $q.reject({code: 'CURRENT_BOARD_EMPTY'});
          }

          return Me.currentBoard.$loaded();
        })
        .then(function() {

          _.each(Me.troopMembers, function(member) {

            if (
              member.boards
              && member.boards[Me.currentBoard.$id]
              && $scope.members.indexOf(member) === -1
            ) {


              if (
                $scope.canDisplayMembers
                || ( member.troopPermission === 'admin' )
                || ( member.userId === Me.troop.createdByUserId )
              ) {

                member['boardPermission'] = member.boards[Me.currentBoard.$id].permission;
                $scope.members.push(member);

              }
            }

          });

          $scope.members = _($scope.members)
            .chain()
            .sortBy('name')
            .sortBy('boardPermission')
            .value()

          $scope.isLoadingMembers = false;

        });
    }
    this.initMembers = function() {

      $scope.isLoadingMembers = true;

      Me.$doneTryingToLoadTroopMember()
        .then(function() {

          return Me.troopMembers.$loaded();
        })
        .then(function() {

          $scope.canDisplayMembers = $scope.membersDisplayCheck();

          that.setMembers();

          Me.troopMembers.$watch(function() {

            that.setMembers();
          });

        });

    };
    this.setAssets = function() {

      $scope.assets = [];
      $scope.assetSizes = {};

      if ( ! Me.currentBoardAssets ) {

        return false;

      }

      // Remove archived assets
      var sortedAssets = _.reject(Me.currentBoardAssets, function(asset) {

        var reject = !! asset.archived;

        if (
          ( ! reject )
          && $scope.detailCardId
          && $scope.detailCardId !== asset.cardId
        ) {
          reject = true;
        }

        return reject;

      });

      sortedAssets = _.sortBy(sortedAssets, function (asset) {

        $scope.assetSizes[asset.$id] = FileFactory.formatBytes(asset.storageSize, 1);

        if ( ! asset.fileName ) {
          return '';
        }

        return asset.fileName.toLowerCase();
      });


      $scope.assets = sortedAssets;

      $scope.isLoadingAssets = false;

    };
    this.initAssets = function() {
      $scope.isLoadingAssets = true;

      Me.currentBoardAssets.$loaded().then(function() {

        that.setAssets();

        Me.currentBoardAssets.$watch(function() {
          that.setAssets();
        })
      })

    };
    this.initCardLists = function() {
      var tagNames = Me.currentBoard.tagNames;

      var cards = [];

      Me.currentBoardCards.$loaded().then(function() {
        cards = Me.currentBoardCards;

        var untaggedCards = _.filter(cards, function(card) {

          return _.isEmpty(card.tags);
        });

        if ( untaggedCards.length > 0 ) {

          $scope.cardListsMap['untagged'] = {
            order: Infinity,
            name: 'untagged',
            title: '',
            label: 'General',
            count: untaggedCards.length,
            cards: untaggedCards
          };
        }

        _.each(tagNames, function(tag, tagName) {

          var tagCards = _.filter(cards, function(card) {
            return (
              card.tags
              && card.tags.hasOwnProperty(tagName)
              && card.tags[tagName] === ''
            );
          });

          $scope.cardListsMap[tagName] = {
            name: tagName,
            title: '#' + tagName.substr(3),
            label: tag.label || tagName.substr(3),
            order: tag.order,
            color: tag.color,
            count: tagCards.length,
            cards: tagCards
          };


          if (Me.currentBoard.tagNames[tagName].count !== $scope.cardListsMap[tagName].count) {
            // try to fix board counts
            Me.currentBoard.tagNames[tagName].count = $scope.cardListsMap[tagName].count;
          }

        });
      });

    }
    this.showMessageModal = function(message) {

      if ( Me.modalIsOn ) {

        return;
      }

      ModalService.showModal({
        templateUrl: '/views/modal/message.html',
        controller: 'MessageModalCtrl'
      }).then(function(modal) {

        modal.scope.message = message;

        modal.scope.accept = function() {

          modal.scope.close();
        };

        modal.close.then(function(result) {

        });

      });
    };
    this.showLeaveBoardModal = function(board, member) {

      if ( Me.modalIsOn ) {

        return;
      }

      ModalService.showModal({
        templateUrl: '/views/modal/delete.html',
        controller: 'DeleteModalCtrl as vm'
      }).then(function(modal) {

        modal.controller.extraClasses = 'remove-board-member-modal'

        if (member.$id === Me.troopMember.$id) {
          modal.controller.header = 'Leave Board';
          modal.controller.message =
              'Are you sure you want to leave the "<b>'
              + board.boardName
              + '</b>" board?';
          modal.controller.actionTaken = ' Leave ';
          modal.controller.element = ' Board';
        }
        else {
          modal.controller.header = 'Remove Board Member';
          modal.controller.message =
            'Are you sure you want to remove the board member "<b>'
            + member.name
            + '</b>"?';
          modal.controller.actionTaken = ' Remove ';
          modal.controller.element = ' Board Member';
        }


        modal.controller.cancel = function() {
          modal.controller.closeModal();
        };

        modal.controller.remove = function() {

          TroopMemberFactory.removeFromBoard({
            troopId: Me.troop.$id,
            memberId: member.$id,
            boardId: Me.currentBoard.$id
          });

          if (member.$id === Me.troopMember.$id) {
            Nav.toAvailableBoards(
              Me.troop.public,
              Me.troopMember.troopPermission !== 'guest'
            );
            // $state.go('home.dashboard.boards.available');
          }

          modal.controller.closeModal();
        };


        modal.controller.close.then(function(result) {

        });

      });
    };
    this.tryToLeaveBoard = function(member, cb) {


      var board = Me.currentBoard;

      if (
        Me.troopMember.boards
        && Me.troopMember.boards.hasOwnProperty(board.$id)
        && Me.troopMember.boards[board.$id].permission === 'admin'
      ) {

        var adminCount = BoardFactory.adminCount(Me.troopMembers, board.$id);

        if ( adminCount > 1 ) {
          cb(board, member);
        }
        else {
          that.showMessageModal("Please promote another member to moderator before you leave this board.");
        }

      }
      else {
        cb(board, member);
      }
    };

    $scope.showTagChange = function(tag, step, toggle) {

      $scope.step = step;
      $timeout(function() {

        $scope.toggleTagChange[tag.name] = toggle;

        if ( toggle ) {
          $scope.changeTagInput[tag.name] = $scope.step === 'label' && Me.currentBoard.tagNames[tag.name][$scope.step] ? Me.currentBoard.tagNames[tag.name][$scope.step] : tag.name.substring(3);
        }

      },0);
    }

    $scope.changeTag = function(tag) {

      $timeout(function() {

        $scope.toggleTagChange[tag.name] = false;

        if ( $scope.step === 'label' ) {

          var tagName = tag.name;

          Me.currentBoard.tagNames[tag.name][$scope.step] = $scope.changeTagInput[tag.name];

          Me.currentBoard.$save().then(function() {
            _.each($sessionStorage.currentBoardTags, function(tag) {

              tag.selected = tagName === tag.name;

            });

            $rootScope.$broadcast('tag-filter-apply', tagName);
          });
        }

        else if ($scope.step === 'name' ) {
          var inputString = $.trim($scope.changeTagInput[tag.name]);
          var tags = _.keys(CardFactory.parseTagString('#' + inputString));

          if (tags.length > 0) {

            var newTagName = tags[0];

            if ( newTagName !== tag.name ) {

              Me.currentBoard.tagNames[newTagName] = Me.currentBoard.tagNames[tag.name];
              delete Me.currentBoard.tagNames[tag.name];


              _.each($scope.cardListsMap[tag.name].cards, function(card) {

                var cardObj = Me.currentBoardCards.$getRecord(card.$id);
                cardObj.tags[newTagName] = cardObj.tags[tag.name];
                delete cardObj.tags[tag.name];

                Me.currentBoardCards.$save(cardObj);
              });

              Me.currentBoard.$save().then(function() {
                // _.each($sessionStorage.currentBoardTags, function(tag) {
                //
                //
                //   tag.selected = 'tag' + inputString === tag.name;
                // });
                //
                // $rootScope.$broadcast('tag-filter-apply', 'tag' + inputString);
              });


            }
          }

        }

      },0);
    }

    $scope.checkDownload = function(asset) {
      var canIDownload = false;
      var boardRead = false;
      var boardPermission = 'admin'
      var createdBy = true;

      if (
        Me.currentBoard
        && Me.troopMember
        && Me.troopMember.boards
        && Me.troopMember.boards[Me.currentBoard.$id]
      ) {
        boardRead = Me.currentBoard.readOnly;
        boardPermission = Me.troopMember.boards[Me.currentBoard.$id].permission;
        createdBy = (asset.createdByUserId === Me.troopMember.userId);
      }


      if (
        boardRead === false
        || (
          boardPermission === 'admin'
          || createdBy
        )
      ) {
        canIDownload = true;
      }

      return canIDownload;
    }

    $scope.selectTag = function($event, selectedTagName) {


      _.each($sessionStorage.currentBoardTags, function(tag) {

        tag.selected = selectedTagName === tag.name;
      });

      $rootScope.$broadcast('tag-filter-apply', selectedTagName);

    };

    $scope.showTroopMemberChatModal = function(member) {

      if ( Me.modalIsOn ) {

        return;
      }

      if (member.$id === Me.troopMember.$id) {
        return false;
      }


      ModalService.showModal({
        templateUrl: '/views/modal/troop-member-chat.html',
        controller: 'TroopMemberChatModalCtrl'
      }).then(function(modal) {

        modal.controller.setMember(member);

        modal.close.then(function(result) {

        });

      });
    }
    $scope.showAssetsModal = function(assetId) {

      if ( Me.modalIsOn ) {

        return;
      }

      Ref.child('assets')
        .child(Me.troop.$id)
        .child(assetId)
        .once('value', function(snap) {

          if (snap.exists()) {
            var asset = snap.val();
            asset.troopId = Me.troop.$id;

            var mimeType = asset.mimeType;

            if ( ! mimeType && asset.fileName ) {
              var ext = asset.fileName.split('.').pop();
              mimeType = MIME_TYPES[ext];
            }

            var fileType = null;
            if ( mimeType ) {
              fileType = FileFactory.fileTypeClass(mimeType);
            }

            if (
              ( asset.metaData && asset.metaData.videoIframe )
              || 'file-video' === fileType
            ) {
              ModalService.showModal({
                templateUrl: '/views/modal/multimedia.html',
                controller: 'MultimediaModalCtrl'
              }).then(function(modal) {

                asset.mimeType = mimeType;
                asset.fileType = fileType;

                modal.controller.setData({
                  troopId: Me.troop.$id,
                  asset: asset
                });

                modal.close.then(function(result) {

                });

              });
            }
            else if (FileFactory.isImageFileType(mimeType)) {
              ModalService.showModal({
                templateUrl: '/views/modal/assets.html',
                controller: 'AssetsModalCtrl'
              }).then(function(modal) {

                var cardAssets = {};
                cardAssets[assetId] = asset;

                modal.controller.setData({
                  troopId: Me.troop.$id,
                  card: {
                    assets: cardAssets
                  },
                  assetId: assetId
                });

                modal.close.then(function(result) {

                });

              });
            }
            else {
              window.open(asset.originalUrl, '_blank');
              //win.focus();
            }

          }

        });
    };
    $scope.setPermission = function(member, newPermission) {

      var oldPermission = member.boards[Me.currentBoard.$id].permission;

      if (oldPermission === newPermission) {

        return false;
      }

      if ( oldPermission === 'admin' ) {

        var adminCount = BoardFactory.adminCount(Me.troopMembers, Me.currentBoard.$id);

        if ( adminCount > 1 ) {

          TroopMemberFactory.setBoardPermission({
            troopId: Me.troop.$id,
            memberId: member.$id,
            boardId: Me.currentBoard.$id,
            permission: newPermission
          });
          member.boards[Me.currentBoard.$id].permission = newPermission;
          $scope.memberMenus[member.$id] = false;
          return false;
        }

        var person = member.$id === Me.troopMember.$id ? 'You' : 'They';

        that.showMessageModal("Please promote another member to moderator before you demote yourself.");

        return false;
      }
      TroopMemberFactory.setBoardPermission({
        troopId: Me.troop.$id,
        memberId: member.$id,
        boardId: Me.currentBoard.$id,
        permission: newPermission
      });
      member.boards[Me.currentBoard.$id].permission = newPermission;
      $scope.memberMenus[member.$id] = false;

    };
    $scope.removeMember = function(member) {

      if (member.$id === Me.troopMember.$id) {

        that.tryToLeaveBoard(member, that.showLeaveBoardModal);
      }
      else {

        that.showLeaveBoardModal(Me.currentBoard, member);
      }

    };
    $scope.showBoardInviteModal = function() {

      if ( Me.modalIsOn ) {

        return;
      }

      ModalService.showModal({
        templateUrl: '/views/modal/board-invite.html',
        controller: 'BoardInviteModalCtrl'
      });

    };
    $scope.showPublicTroopJoinModal = function() {

      if ( Me.modalIsOn ) {

        return;
      }

      ModalService.showModal({
        templateUrl: '/views/modal/public-troop-join.html',
        controller: 'PublicTroopJoinModalCtrl as vm'
      })
      .then(function(modal) {

        modal.controller.setMessage('Log in or Sign up to join the community. Members can chat, add notes, create cards and boards, and much more.');
      });
    };
    $scope.navToTroopMember = function(troopMemberId) {

      if (Me.troopMember.$id === troopMemberId ) {
        return false;
      }
      else if ( Me.troopMember.troopPermission === 'guest' ) {
        $scope.showPublicTroopJoinModal();
        return false;
      }

      Me.loadCurrentTroopMember(troopMemberId);

      Nav.toMemberChat(
        Me.troop.public,
        Me.troopMember.troopPermission !== 'guest',
        troopMemberId
      );
      // $state.go('home.dashboard.troopMember.chat', { troopMemberId: troopMemberId });
    };

    Auth.$loaded()
    .then(function() {
      return Me.$doneRedirecting();
    })
    .catch(function(error) {

      if ( error && error.code ) {

        switch (error.code) {

          case 'SIGNING_IN':
            // continue loading if signing in
            return this;
            break;

          default:
            TroopLogger.error(logConfig, error);
            break;
        }
      }
      else {
        TroopLogger.error(logConfig, error);
      }

      // otherwise skip loading
      return $q.reject(error);
    })
    .then(function() {

      return Me.trooper.$loaded();
    })
    .then(function() {

      return Me.$doneTryingToLoadTroop();
    })
    .then(function() {

      return Me.troop.$loaded();
    })
    .then(function() {

      return Me.$doneTryingToLoadBoard();
    })
    .then(function() {

      if ( ! Me.currentBoard ) {
        // no firebaseobject, doesn't have access to board
        return false;
      }

      Me.currentBoard.$loaded().then(function() {

        that.initAssets();
        that.initMembers();
        that.initCardLists();

        that.prevBoardId = Me.currentBoard.$id;

        $scope.$on('board-changed', function() {

          $scope.assets = [];
          $scope.assetSizes = {};

          Me.currentBoard.$loaded().then(function() {

            that.initAssets();
            that.initMembers();
            that.initCardLists();
            that.prevBoardId = Me.currentBoard.$id;

          });
        });

      });

      Me.currentBoardCards.$watch(function(data) {

        switch (data.event) {
          case 'child_changed':
            that.initCardLists();
            break;
        }

      });

    });


    $scope.$on('tag-filter-apply', function(event, selectedTagName) {

      $scope.selectedSection = 'tags';

    });

    $scope.$on('$stateChangeSuccess', function(event, toState, toParams, fromState, fromParams) {

      if ( ! Me.showRightSidebar ) {
        Me.showRightSidebar = {};
      }

      switch (toState.name) {
        case 'home.dashboard.board.card':
        case 'public.dashboard.board.card':
          $scope.detailCardId = toParams.cardId;

          that.setAssets();
          if (
              Me.screen.size !== 'mobile'
              && ! Me.showRightSidebar.hasOwnProperty(toState.name)
          ) {

            Me.showRightSidebar[toState.name] = true;
          }

          break;

        case 'home.dashboard.board.cards':
        case 'public.dashboard.board.cards':
        case 'home.dashboard.board.chat':
        case 'public.dashboard.board.chat':

          $scope.detailCardId = null;
          that.setAssets();
          if (
            Me.screen.size !== 'mobile'
           && ! Me.showRightSidebar.hasOwnProperty(toState.name)
          ) {

            Me.showRightSidebar[toState.name] = true;
          }

          break;

        case 'home.dashboard.board.tags':
        case 'public.dashboard.board.tags':
        case 'home.dashboard.board.grid':
        case 'public.dashboard.board.grid':
        case 'home.dashboard.board.table':
        case 'public.dashboard.board.table':
        case 'home.dashboard.board.document':
        case 'public.dashboard.board.document':
          $scope.detailCardId = null;
          that.setAssets();
          if ( ! Me.showRightSidebar.hasOwnProperty(toState.name)) {

            Me.showRightSidebar[toState.name] = false;
          }
          break;

        default:
            $scope.detailCardId = null;
          break;
      }


      $timeout(function() {
        $rootScope.showRightSidebar = Me.showRightSidebar[toState.name];
      }, 10);


    });

    $scope.$on('table-view-loaded', function(event) {

      // vm.selectedTagName = selectedTagName;
    });


  }
