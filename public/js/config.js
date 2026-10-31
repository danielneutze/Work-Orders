// App-wide settings. Change these here; nothing else needs editing.

export const firebaseConfig = {
  apiKey: "AIzaSyDVF4KzfE2azC1xyXaWa0d_A5TCmegP42I",
  authDomain: "minits-app-c26e1.firebaseapp.com",
  projectId: "minits-app-c26e1",
  storageBucket: "minits-app-c26e1.firebasestorage.app",
  messagingSenderId: "685083337695",
  appId: "1:685083337695:web:209713a8fcdea580339a6a",
};

// The email that becomes the Owner account on first sign-in.
// It must match OWNER_EMAIL in firestore.rules.
export const OWNER_EMAIL = "daniel@minitstx.com";

export const BUSINESS_NAME = "Work Orders";

// Teams created by the "Set up teams" button on the Team screen.
export const DEFAULT_TEAMS = [
  { id: "maintenance", name: "Maintenance" },
  { id: "construction", name: "Construction" },
  { id: "ranch", name: "Ranch" },
  { id: "shop", name: "Mechanic shop" },
];

export const ROLES = {
  owner: "Owner",
  manager: "Manager",
  tech: "Tech",
  requester: "Requester",
};
