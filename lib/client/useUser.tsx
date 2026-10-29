"use client";

import React, { createContext, useContext } from "react";
import type { Role } from "@/shared/types";

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface UserContextValue {
  user: CurrentUser | null;
  role: Role;
  isViewer: boolean;
  isAdmin: boolean;
  isOwner: boolean;
}

const defaultContext: UserContextValue = {
  user: null,
  role: "VIEWER",
  isViewer: true,
  isAdmin: false,
  isOwner: false,
};

const UserContext = createContext<UserContextValue>(defaultContext);

export function UserProvider({
  user,
  children,
}: {
  user: CurrentUser | null;
  children: React.ReactNode;
}) {
  const role: Role = user?.role ?? "VIEWER";
  const isViewer = role === "VIEWER";
  const isAdmin = role === "ADMIN" || role === "OWNER";
  const isOwner = role === "OWNER";

  return (
    <UserContext.Provider value={{ user, role, isViewer, isAdmin, isOwner }}>
      {children}
    </UserContext.Provider>
  );
}

export function useCurrentUser(): UserContextValue {
  return useContext(UserContext);
}

