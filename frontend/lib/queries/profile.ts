"use client";

import { useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { useAuth } from "@/context/auth-context";
import type { User } from "@/types";

// No error toast here: the form shows the error right under the field
export function useSavePhone() {
  const { updateUser } = useAuth();

  return useMutation({
    mutationFn: async (phone: string) => {
      const { data } = await api.patch<{ user: User }>("/auth/me", { phone });
      return data.user;
    },
    onSuccess: (user) => {
      // The saved session learns the number at once: the checkout can continue
      updateUser({ phone: user.phone });
      toast.success("Phone number saved");
    },
  });
}
