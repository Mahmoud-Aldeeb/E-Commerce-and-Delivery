// What a product card looks like while it loads: the same parts, in the same order, as ProductCard
// (a square image, a title of two lines, the price, the button), so the page does not jump
// when the real cards arrive
export default function ProductCardSkeleton() {
  return (
    <div className="card flex h-full flex-col overflow-hidden" aria-hidden="true">
      <div className="skeleton aspect-square w-full" />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-4 w-2/3" />
        <div className="skeleton mt-auto h-6 w-20" />
        <div className="skeleton h-10 w-full" />
      </div>
    </div>
  );
}