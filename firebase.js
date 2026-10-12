// ---------------------------------------------------------------
// Firebase setup — shared by every page.
// Uses the compat SDK so it can be dropped in with plain <script> tags,
// no bundler required.
// ---------------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyDtzE03phFwrkkHJl_jU1bnOVmmRZo34sg",
  authDomain: "afk-league.firebaseapp.com",
  databaseURL: "https://afk-league-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "afk-league",
  storageBucket: "afk-league.firebasestorage.app",
  messagingSenderId: "656897329307",
  appId: "1:656897329307:web:013160593258749ac49e3e",
  measurementId: "G-JSH8N86Q8J"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// The only 3 accounts allowed to post/edit content.
// Add each admin as a user in Firebase Authentication (Email/Password),
// then list their emails here AND in your Firestore security rules.
const ADMIN_EMAILS = [
  "admin1@afkleague.com",
  "admin2@afkleague.com",
  "admin3@afkleague.com"
];

function isAdminEmail(email) {
  return !!email && ADMIN_EMAILS.includes(email.toLowerCase());
}
