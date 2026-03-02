import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyAFsisCCGyNLOl-iWuwupEJ16DUSgoHVCY",
  authDomain: "earningapk-e573e.firebaseapp.com",
  databaseURL: "https://earningapk-e573e-default-rtdb.firebaseio.com",
  projectId: "earningapk-e573e",
  storageBucket: "earningapk-e573e.firebasestorage.app",
  messagingSenderId: "1048956135436",
  appId: "1:1048956135436:web:86c7ade74854db2f162629",
  measurementId: "G-62H75GG8GD"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;
