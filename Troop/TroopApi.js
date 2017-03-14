/* global Firebase, $  */
/* jshint strict: true */
/* jshint -W014 */

'use strict';

/**
 * @ngdoc service
 * @name webClientApp.TroopApi
 * @description
 * # TroopApi
 * Factory in the webClientApp.
 */
angular.module('webClientApp')
  .factory(
    'TroopApi',
    [
      '$q',
      '$http',
      '$localStorage',
      'Ref',
      'Upload',
      '$firebaseAuth',
      'API_USER',
      'API_USER_NUT',
      'API_KEY',
      'API_SERVER_URL',
      'UPLOAD_SERVER_URL',
      'NOTIFICATION_SERVER_URL',
      'FB_APP',
      'TroopLogger',
      function(
        $q,
        $http,
        $localStorage,
        Ref,
        Upload,
        $firebaseAuth,
        API_USER,
        API_USER_NUT,
        API_KEY,
        API_SERVER_URL,
        UPLOAD_SERVER_URL,
        NOTIFICATION_SERVER_URL,
        FB_APP,
        TroopLogger
      ) {
        var logConfig = {
          slug: 'service: TroopApi - ',
          path: [ 'services', 'TroopApi.js']
        };
        return {
          _token: null,
          _loginId: null,

          setToken: function(token, loginId) {

            TroopLogger.debug(
              logConfig,
              'setToken',
              'loginId', loginId,
              'token', [ token ]
            );

            this._token = token;
            this._loginId = loginId;

            $localStorage.token = token;
          },

          callServer: function(options) {

            var that = this;
            var headers = {
              'Content-Type': 'application/json; charset=utf-8',
              'x-troop-api': API_KEY
            };

            var firebaseUser = firebase.auth().currentUser;

            if ( ! firebaseUser ) {

              var method = options.method ? options.method : 'POST';

              return $http({
                url: options.url,
                method: method,
                withCredentials: true,
                headers: headers,
                data: options.data || null,
                fields: options.fields || null
              });

            }
            else {

              var deferred = $q.defer();

              firebaseUser
              .getToken(true)
              .then(function(idToken) {

                headers['x-troop-token'] = that._token = idToken;

                var method = options.method ? options.method : 'POST';

                return $http({
                  url: options.url,
                  method: method,
                  withCredentials: true,
                  headers: headers,
                  data: options.data || null,
                  fields: options.fields || null
                });
              })
              .then(function(result) {

                deferred.resolve(result);
              })
              .catch(function(error) {

                deferred.reject(error);
              });

              return deferred.promise;
            }






          },
          callServerOld: function(options) {

            var that = this;
            var headers = {
              'Content-Type': 'application/json; charset=utf-8',
              'x-troop-api': API_KEY
            };

            if ( that._token ) {
              headers['x-troop-token'] = that._token;
            }


            var method = options.method ? options.method : 'POST';

            return $http({
              url: options.url,
              method: method,
              withCredentials: true,
              headers: headers,
              data: options.data || null,
              fields: options.fields || null
            });


          },
          addTroop: function(options) {

            var that = this;
            var deferred = $q.defer();

            that.callServer({
              url: API_SERVER_URL + '/user/troop/' + options.uid,
              data: {
                memberId: options.troopMemberId,
                troopId: options.troopId,
                troopPermission: options.troopPermission
              }
            })
            .then(function() {

              that.callServer({
                url: API_SERVER_URL + '/troop/create/member',
                data: {
                  troopId: options.troopId,
                  troopMemberName: options.troopMemberName,
                  troopMemberId: options.troopMemberId
                }
              })
              .then(function(resp) {

                deferred.resolve(resp);
              });
            })
            .catch(function(error) {

              deferred.reject(error);
            });

            return deferred.promise;

          },
          createTroop: function(options){

            var deferred = $q.defer();

            this.callServer({
              url: API_SERVER_URL + '/troop/create/',
              data: {
                troopName: options.troopName
              }
            })
            .then(function callServerDone(resp) {
              deferred.resolve(resp);
            })
            .catch(function(error) {

              console.log(error);
              deferred.reject(error);
            });

            return deferred.promise;
          },
          createMember: function(options){

            TroopLogger.debug(logConfig,'createMember','options',options);

            var deferred = $q.defer();

            this.callServer({
              url: API_SERVER_URL + '/member/create/',
              data: {
                troopId: options.troopId,
                name: options.name,
                troopPermission: options.troopPermission
              }
            })
            .then(function callServerDone(resp) {

              deferred.resolve(resp);
            })
            .catch(function(error) {

              console.log(error);
              deferred.reject(error);
            });

            return deferred.promise;

          },
          uploadFromUrl: function(options) {

            if ( ! options.troopId ) {
              return $q.reject({ code: 'MISSING_TROOP_ID' });
            }

            if ( ! options.url ) {
              return $q.reject({ code: 'MISSING_URL' });
            }

            var that = this;
            var deferred = $q.defer();

            if ( ! options ) {
              options = {};
            }

            that.callServer({
              url: UPLOAD_SERVER_URL + '/upload/url',
              data: {
                url: options.url,
                uid: options.uid,
                assetLocation: '/assets/' + options.troopId,
                assetId: options.assetId,
                app: FB_APP
              }
            })
            .then(function(resp) {

              deferred.resolve(resp);
            })
            .catch(function(error) {

              deferred.reject(error);
            });


            return deferred.promise;

          },
          uploadFile: function(options) {



            if ( ! options.troopId ) {
              return $q.reject({ code: 'MISSING_TROOP_ID' });
            }

            var that = this;
            var deferred = $q.defer();

            var headers = {
              'Content-Type': 'application/json; charset=utf-8',
              'x-troop-api': API_KEY
            };

            var firebaseUser = firebase.auth().currentUser;

            firebaseUser
            .getToken(true)
            .then(function(idToken) {

              headers['x-troop-token'] = that._token = idToken;

              var uploader = Upload.upload({
                url: UPLOAD_SERVER_URL + '/upload',
                file: options.$file,
                method: 'POST',
                headers: headers,
                fields: {
                  assetLocation: '/assets/' + options.troopId,
                  assetId: options.assetId,
                  app: FB_APP
                }
              });

              deferred.resolve(uploader);
            })
            .catch(function(error) {

              deferred.reject(error);
            });





            return deferred.promise;

          },
          uploadAvatar: function(options) {

            var that = this;
            var deferred = $q.defer();

            var headers = {
              'Content-Type': 'application/json; charset=utf-8',
              'x-troop-api': API_KEY
            };

            var firebaseUser = firebase.auth().currentUser;

            firebaseUser
            .getToken(true)
            .then(function(idToken) {

              headers['x-troop-token'] = that._token = idToken;

              var uploader = Upload.upload({
                url: UPLOAD_SERVER_URL + '/avatar/upload',
                file: options.$file,
                method: 'POST',
                headers: headers,
                fields: {}
              });

              deferred.resolve(uploader);
            })
            .catch(function(error) {

              deferred.reject(error);
            });

            return deferred.promise;

          },

          uploadAvatarUrl: function(options) {

            if ( ! options.url ) {
              return $q.reject({ code: 'MISSING_URL' });
            }

            var that = this;
            var deferred = $q.defer();

            if ( ! options ) {
              options = {};
            }

            that.callServer({
              url: UPLOAD_SERVER_URL + '/avatar/upload/url',
              data: {
                url: options.url
              }
            })
            .then(function(resp) {

              deferred.resolve(resp);
            })
            .catch(function(error) {

              deferred.reject(error);
            });


            return deferred.promise;

          },

          logout: function() {
            this._token = null;
            this._loginId = null;

            $localStorage.token = null;
          },
          login: function(options) {

            TroopLogger.debug(logConfig, 'login');

            var that = this;
            var deferred = $q.defer();

            if (that._token && (that._loginId === options.loginId) ) {

              deferred.resolve({ code: 'ALREADY_LOGGED_IN' });
              return deferred.promise;
            }

            that.setToken(null, null);

            that.callServer({
              url: API_SERVER_URL + '/user/login',
              data: {
                loginId: options.loginId,
                password: options.password,
                tc: options.tc
              }
            })
            .then(function(resp) {
              TroopLogger.debug(logConfig, 'login successful, resp:', resp);
              if ( resp ) {

                that.setToken(resp.data.token, options.loginId);
              }

              deferred.resolve(resp);
            })
            .catch(function(error) {

              if ( error && (error.code === 'ALREADY_LOGGED_IN') ) {
                deferred.resolve(error);
              }
              else {
                deferred.reject(error);
              }

            });

            return deferred.promise;
          },
          oauth: function(options) {
            TroopLogger.debug(logConfig, 'oauth');

            var that = this;
            var deferred = $q.defer();

            if (that._token && (that._loginId === options.email) ) {

              deferred.resolve({ code: 'ALREADY_LOGGED_IN' });
              return deferred.promise;
            }

            that.setToken(null, null);

            that.callServer({
              url: API_SERVER_URL + '/user/login/oauth',
              data: {
                token: options.token,
                uid: options.uid,
                name: options.name,
                email: options.email,
                provider: options.provider,
                avatarUrl: options.avatarUrl,
                tc: options.tc,
                inviteToken: options.inviteToken
              }
            })
            .then(function(resp) {
              TroopLogger.debug(logConfig, 'oauth successful, resp:', resp);
              that.setToken(options.token, options.email);

              deferred.resolve(resp);
            })
            .catch(function(error) {

              if ( error && (error.code === 'ALREADY_LOGGED_IN') ) {
                deferred.resolve(error);
              }
              else {
                deferred.reject(error);
              }

            });

            return deferred.promise;
          },

          refresh: function(options) {
            TroopLogger.debug(logConfig, 'refresh');

            var that = this;
            var deferred = $q.defer();

            if (that._token && (that._loginId === options.loginId) ) {

              deferred.resolve({ code: 'ALREADY_LOGGED_IN' });
              return deferred.promise;
            }

            that._token = null;
            that._loginId = null;

            that.callServer({
              url: API_SERVER_URL + '/user/refresh',
              data: {
                loginId: options.loginId,
              }
            })
            .then(function(resp) {
              TroopLogger.debug(logConfig, 'refresh successful, resp:', resp);
              if ( resp ) {
                that._token = resp.data.token;
                that._loginId = options.loginId;
              }

              deferred.resolve(resp);
            })
            .catch(function(error) {

              if ( error && (error.code === 'ALREADY_LOGGED_IN') ) {
                deferred.resolve(error);
              }
              else {
                deferred.reject(error);
              }

            });

            return deferred.promise;
          },
          updateUserOld: function(options) {

            var that = this;
            var deferred = $q.defer();

            var payload = {};

            if ( options.name ) {
              payload.name = options.name;
            }

            if ( options.oldPassword ) {
              payload.oldPassword = options.oldPassword;
            }
            if ( options.newPassword ) {
              payload.newPassword = options.newPassword;
            }

            that.callServer({
              url: API_SERVER_URL + '/user/' + options.userId,
              method: 'PUT',
              data: payload
            })
            .then(function(res) {

              deferred.resolve(res);
            })
            .catch(function(error) {

              console.log(error);

              if ( error  ) {

                deferred.reject(error);
              }

            });

            return deferred.promise;
          },

          updateTroop: function(options) {

            var that = this;
            var deferred = $q.defer();

            that.callServer({
              url: API_SERVER_URL + '/user/troop/' + options.uid,
              method: 'PUT',
              data: {
                memberId: options.memberId,
                troopId: options.troopId,
                troopPermission: options.troopPermission
              }
            })
            .then(function(resp) {

              deferred.resolve(resp);
            })
            .catch(function(error) {

              console.log(error);
              deferred.reject(error);
            });


            return deferred.promise;
          },

          updateUser: function(options) {

            var that = this;
            var deferred = $q.defer();

            that.callServer({
              url: API_SERVER_URL + '/user/',
              method: 'PUT',
              data: options
            })
            .then(function(resp) {

              deferred.resolve(resp);
            })
            .catch(function(error) {

              console.log(error);
              deferred.reject(error);
            });


            return deferred.promise;

          },

          archiveTroop: function(options) {

            var that = this;
            var deferred = $q.defer();

            that.callServer({
              url: API_SERVER_URL + '/troop/' + options.troopId,
              method: 'DELETE'
            })
            .then(function(resp) {

              deferred.resolve(resp);
            })
            .catch(function(error) {

              console.log(error);
              deferred.reject(error);
            });


            return deferred.promise;
          },

          sendPasswordReset: function(loginId) {

            var that = this;
            var deferred = $q.defer();

            that.login({
              loginId: API_USER,
              password: API_USER_NUT
            })
            .then(function() {

              return that.callServer({
                url: API_SERVER_URL + '/user/reset',
                method: 'POST',
                data: {
                  loginId: loginId
                }
              });
            })
            .then(function(resp) {

              deferred.resolve(resp);
            })
            .catch(function(error) {

              deferred.reject(error);
            });

            return deferred.promise;

          },
          applyPasswordReset: function(data) {

            var that = this;
            var deferred = $q.defer();

            that.login({
              loginId: API_USER,
              password: API_USER_NUT
            })
            .then(function() {

              return that.callServer({
                url: API_SERVER_URL + '/user/reset',
                method: 'PUT',
                data: {
                  token: data.token,
                  newPassword: data.newPassword
                }
              });
            })
            .then(function(resp) {

              deferred.resolve(resp);
            })
            .catch(function(error) {

              deferred.reject(error);
            });

            return deferred.promise;

          },

          generateUserCode: function(options) {

            var that = this;
            var deferred = $q.defer();

            that.login({
              loginId: API_USER,
              password: API_USER_NUT
            })
            .then(function() {

              return that.callServerOld({
                url: API_SERVER_URL + '/user/code',
                data: {
                  loginId: options.loginId
                }
              });
            })
            .then(function(resp) {

              deferred.resolve(resp);
            })
            .catch(function(error) {

              deferred.reject(error);
            });


            return deferred.promise;

          },
          verifyUserCode: function(options) {

            var that = this;
            var deferred = $q.defer();

            that.login({
              loginId: API_USER,
              password: API_USER_NUT
            })
            .then(function() {

              return that.callServerOld({
                url: API_SERVER_URL + '/user/code/verify',
                data: {
                  loginId: options.loginId,
                  code: options.code
                }
              });
            })
            .then(function(resp) {

              deferred.resolve(resp);
            })
            .catch(function(error) {

              deferred.reject(error);
            });

            return deferred.promise;
          },
          addUser: function(options) {

            var that = this;
            var deferred = $q.defer();

            that.login({
              loginId: API_USER,
              password: API_USER_NUT
            })
            .then(function(resp) {

              return that.callServerOld({
                url: API_SERVER_URL + '/user/add',
                data: {
                  loginId: options.loginId,
                  name: options.name,
                  password: options.password
                }
              });
            })
            .then(function(resp) {

              deferred.resolve(resp);
            })
            .catch(function(error) {

              deferred.reject(error);
            });

            return deferred.promise;
          },

          removeFromTroop: function(options) {

            var that = this;
            var deferred = $q.defer();

            var payload = {};

            payload.troopPermission = 'discharged';

            if ( options.memberId ) {
              payload.memberId = options.memberId;
            }
            if ( options.troopId ) {
              payload.troopId = options.troopId;
            }
            if ( options.troopPermission ) {
              payload.troopPermission = options.troopPermission;
            }

            that.callServer({
              url: API_SERVER_URL + '/user/troop/' + options.uid,
              method: 'DELETE',
              data: payload
            })
            .then(function(res) {

              deferred.resolve(res);
            })
            .catch(function(error) {

              //console.log(error);
              TroopLogger.error(logConfig, 'removeFromTroop - Error', error);

              if ( error  ) {

                deferred.reject(error);
              }

            });

            return deferred.promise;
          },

          acceptInvite: function(options) {

            // if ( ! options.userId ) {
            //
            //   return $q.reject({ code: 'MISSING_USER_ID'});
            // }
            TroopLogger.debug(logConfig, 'TroopAPI - accept Invite', options)

            if (
              ( ! options.inviteToken )
              && ( ! options.troopId )
            ) {
              return $q.reject({ code: 'MISSING_INVITE_INFO'});
            }



            var that = this;
            var payload = {};

            if ( options.inviteToken ) {
              payload.token = options.inviteToken;
            }

            if ( options.troopId ) {
              payload.troopId = options.troopId;
            }

            if (options.inviteId ) {
              payload.inviteId = options.inviteId;
            }

            if (options.userId ) {
              payload.userId = options.userId;
            }

            if (options.reject ) {
              payload.reject = options.reject;
            }
            else{
              payload.reject = false;
            }


            return that.callServer({
              url: NOTIFICATION_SERVER_URL + '/accept/troop',
              data: payload
            });

          },

          joinPublicTroop: function(options) {

            if ( ! options.troopId ) {

              return $q.reject({ code: 'MISSING_TROOP_INFO'});
            }

            var that = this;
            var payload = {
              userId: options.userId
            };


            if ( options.troopId ) {
              payload.troopId = options.troopId;
            }

            if (options.reject ) {
              payload.reject = options.reject;
            }
            else{
              payload.reject = false;
            }
            return that.callServer({
              url: NOTIFICATION_SERVER_URL + '/accept/troop',
              data: payload
            });
          },

          acceptBoardInvite: function(options) {

            // if ( ! options.userId ) {
            //
            //   return $q.reject({ code: 'MISSING_USER_ID'});
            // }
            // else
            if (
              ( ! options.token )
              && ( ! options.troopId )
            ) {

              return $q.reject({ code: 'MISSING_INVITE_INFO'});
            }

            var that = this;

            var payload = {
              boardId: options.boardId
            };

            if ( options.token ) {
              payload.token = options.token;
            }

            if ( options.troopId ) {
              payload.troopId = options.troopId;
            }

            if (options.inviteId ) {
              payload.inviteId = options.inviteId;
            }

            if (options.memberId ) {
              payload.memberId = options.memberId;
            }

            if (options.reject ) {
              payload.reject = options.reject;
            }
            else{
              payload.reject = false;
            }

            return that.callServer({
              url: NOTIFICATION_SERVER_URL + '/accept/board',
              data: payload
            });

          },

          makeTroopPublic: function(options) {

            var that = this;
            var deferred = $q.defer();

            var payload = {};

            if ( options.slug ) {
              payload.slug = options.slug;
            }
            if ( options.troopId ) {
              payload.troopId = options.troopId;
            }

            that.callServer({
              url: API_SERVER_URL + '/troop/public',
              method: 'POST',
              data: payload
            })
            .then(function(res) {

              deferred.resolve(res);
            })
            .catch(function(error) {

              console.log(error);

              if ( error  ) {

                deferred.reject(error);
              }

            });

            return deferred.promise;
          },

          makeTroopPrivate: function(options) {

            var that = this;
            var deferred = $q.defer();

            var payload = {};

            if ( options.troopId ) {
              payload.troopId = options.troopId;
            }


            that.callServer({
              url: API_SERVER_URL + '/troop/private',
              method: 'POST',
              data: payload
            })
            .then(function(res) {

              deferred.resolve(res);
            })
            .catch(function(error) {

              console.log(error);

              if ( error  ) {

                deferred.reject(error);
              }

            });

            return deferred.promise;
          },

          validateSlug: function(options) {

            var that = this;
            var deferred = $q.defer();

            var payload = {};

            if ( options.slug ) {
              payload.slug = options.slug;
            }
            if ( options.token ) {
              payload.token = options.token;
            }

            that.callServer({
              url: API_SERVER_URL + '/troop/public/validate',
              method: 'POST',
              data: payload
            })
            .then(function(res) {

              deferred.resolve(res);
            })
            .catch(function(error) {

              console.log(error);

              if ( error  ) {

                deferred.reject(error);
              }

            });

            return deferred.promise;
          },

          moveCard: function(options) {

            var that = this;
            var deferred = $q.defer();

            that.callServer({
              url: API_SERVER_URL + '/card/move',
              method: 'POST',
              data: {
                troopId:options.troopId,
                fromBoardId:options.fromBoardId,
                toBoardId:options.toBoardId,
                cardId:options.cardId
              }
            })
            .then(function(resp) {

              deferred.resolve(resp);
            })
            .catch(function(error) {

              console.log(error);
              deferred.reject(error);
            });


            return deferred.promise;
          },

        };
      }
    ]
  );
