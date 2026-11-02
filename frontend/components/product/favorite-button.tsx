"use client";

import { HeartIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { useFavoriteIds, useToggleFavorite } from "@/lib/queries/favorites";

interface FavoriteButtonProps {
  productId: string;
  productName: string;
  className?: string;
}

export default function FavoriteButton({ productId, productName, className = "" }: FavoriteButtonProps) {
  const router = useRouter();
  const { user, isReady } = useAuth();
  const { data: ids } = useFavoriteIds();
  const toggle = useToggleFavorite();

  const favorited = ids?.includes(productId) ?? false;

  function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    // The button may sit on a card that is a link: pressing it must not open the product
    event.preventDefault();
    event.stopPropagation();

    // A visitor is sent to sign in, and brought back to this page afterwards
    if (!user) {
      const target = window.location.pathname + window.location.search;
      router.push(`/login?redirect=${encodeURIComponent(target)}`);
      return;
    }
    toggle.mutate({ productId, favorite: !favorited });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!isReady}
      aria-pressed={favorited}
      aria-label={favorited ? `Remove ${productName} from favorites` : `Add ${productName} to favorites`}
      className={`btn btn-ghost p-2 ${className}`}
    >
      <HeartIcon className={`size-5 ${favorited ? "fill-danger text-danger" : ""}`} />
    </button>
  );
}