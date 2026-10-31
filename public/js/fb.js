// Firebase setup. The SDK loads from Google's CDN, pinned to one version.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, onAuthStateChanged, RecaptchaVerifier, signInWithPhoneNumber,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification,
  sendPasswordResetEmail, signOut,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot,
  query, where, serverTimestamp, increment, runTransaction, writeBatch, Timestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
  getStorage, ref, uploadBytes, getDownloadURL, deleteObject,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";
import { firebaseConfig } from "./config.js";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
auth.useDeviceLanguage();

// Local cache keeps the app readable with weak signal and queues writes until it reconnects.
let firestore;
try {
  firestore = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
} catch (e) {
  firestore = initializeFirestore(app, {});
}
export const db = firestore;
export const storage = getStorage(app);

export {
  onAuthStateChanged, RecaptchaVerifier, signInWithPhoneNumber,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification,
  sendPasswordResetEmail, signOut,
  collection, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot,
  query, where, serverTimestamp, increment, runTransaction, writeBatch, Timestamp,
  ref, uploadBytes, getDownloadURL, deleteObject,
};
