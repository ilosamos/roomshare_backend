const functions = require('firebase-functions');
const FCM = require('fcm-node');
const admin = require('firebase-admin');

admin.initializeApp(functions.config().firebase);

exports.statusChanged = functions.database.ref('/rooms/{roomID}/status')
    .onWrite(event => {
      // Grab the current value of what was written to the Realtime Database.
      const roomID = event.params.roomID;
      const status = event.data.val();

      console.log('Status of room "', roomID, '" has changed to ', status,'.');

      //get all followers of this room
      var followersRef = admin.database().ref(`/rooms/${roomID}/follower/`);

      return followersRef.once('value', function(snapshot) {
          const deviceTokens = [];

          snapshot.forEach(function(childSnapshot) {
              var followerUid = childSnapshot.key;
              console.log('Follower found: ',followerUid);

              admin.database().ref(`/users/${followerUid}/notificationTokens`).once('value', function(tokensSnapshot) {
                  if (tokensSnapshot.hasChildren()) {
                      const tokens = Object.keys(tokensSnapshot.val());
                      console.log(tokens.length,' tokens found for user ',followerUid, ' now sending notification');

                      //Get user profile of user in room
                      const getUserProfile = admin.auth().getUser(followerUid).then(profile => {
                          // Notification details.
                          var statusDescription;
                          var notificationBody;

                          if (status == 1) {
                              statusDescription = "occupied";
                              notificationBody = `${profile.displayName} has entered!`
                          }
                          else if (status == 0) {
                              statusDescription = "free";
                              notificationBody = `${profile.displayName} has left!`
                          }

                          const payload = {
                            notification: {
                              title: `Room is now ${statusDescription}!`,
                              body: notificationBody,
                              sound: "default"
                            }
                          };
                          //send notification to all tokens of user
                          return admin.messaging().sendToDevice(tokens, payload).then(response => {
                            // For each message check if there was an error.
                            const tokensToRemove = [];
                            response.results.forEach((result, index) => {
                              const error = result.error;
                              if (error) {
                                console.error('Failure sending notification to', tokens[index], error);
                                // Cleanup the tokens who are not registered anymore.
                                if (error.code === 'messaging/invalid-registration-token' ||
                                    error.code === 'messaging/registration-token-not-registered') {
                                  tokensToRemove.push(tokensSnapshot.ref.child(tokens[index]).remove());
                                }
                              }
                            }); //ent response.results.foreach
                            return Promise.all(tokensToRemove);
                          }); //End send notification

                      }); //end get user profile

                    } //end if tokens haschildren
                  else {
                      console.log("no tokens for user ",followerUid);
                  }
              }); //end notificationTokens.once
          }); //forEach folowers
      }); //end followersReference.once
    });
