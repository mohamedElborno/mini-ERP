"use client";

import { UserButton } from "@clerk/nextjs";

export function NavUser() {
  return (
    <div className="flex justify-center px-2 py-2">
      <UserButton
        appearance={{
          elements: { userButtonAvatarBox: "h-9 w-9" },
        }}
      />
    </div>
  );
}
