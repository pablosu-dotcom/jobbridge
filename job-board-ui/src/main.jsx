import React from "react";
import ReactDOM from "react-dom/client";
import { AuthProvider } from "@asgardeo/auth-react";
import App from "./App";
import "./index.css";

const authConfig = {
  clientID: "IFeHNIzZA8Pg5wxNCHZGU7OR7ysa",
  baseUrl: "https://api.asgardeo.io/t/pabloco",
  signInRedirectURL: "http://localhost:5173",
  signOutRedirectURL: "http://localhost:5173",
  scope: ["openid", "profile", "roles"],
};

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider config={authConfig}>
      <App />
    </AuthProvider>
  </React.StrictMode>
);