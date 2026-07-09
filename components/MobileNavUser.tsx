"use client";

import { UserButton } from "@clerk/nextjs";

export function MobileNavUser() {
  return (
    <UserButton
      appearance={{
        elements: {
          userButtonAvatarBox: "h-8 w-8",
          userButtonTrigger: "rounded-full",
        },
      }}
    />
  );
}
