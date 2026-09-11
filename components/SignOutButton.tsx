"use client";

import { clearSessionToken } from "@/lib/apiClient";

export default function SignOutButton() {
  return (
    <button
      type="button"
      className="login-signout"
      onClick={() => {
        clearSessionToken();
        window.location.href = "/login";
      }}
    >
      Sair
    </button>
  );
}
