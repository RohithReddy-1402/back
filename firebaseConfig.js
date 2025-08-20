// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAx2GQQy_1YvSuahF5IVTwQofCF8CI8aPg",
  authDomain: "nitkkrpreviouspapers-75bbd.firebaseapp.com",
  projectId: "nitkkrpreviouspapers-75bbd",
  storageBucket: "nitkkrpreviouspapers-75bbd.firebasestorage.app",
  messagingSenderId: "287168887268",
  appId: "1:287168887268:web:6b47a85348ca816dc6eff1",
  measurementId: "G-XT22XD8R85"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);