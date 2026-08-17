import React from "react";
import ReactDOM from "react-dom/client";
import { AuthProvider } from "@asgardeo/auth-react";
import App from "./App";
import "./index.css";

const appUrl = window.location.origin;

const authConfig = {
  clientID: "IFeHNIzZA8Pg5wxNCHZGU7OR7ysa",
  baseUrl: "https://api.asgardeo.io/t/pabloco",
  signInRedirectURL: appUrl,
  signOutRedirectURL: appUrl,
  scope: [
    "openid",
    "profile",
    "roles",
    "jobs:write",
    "organization:manage",
    "admin",
  ],
};

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider config={authConfig}>
      <App />
    </AuthProvider>
  </React.StrictMode>
);
