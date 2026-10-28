export default function ProductPageSkeleton() {
  return (
    <div aria-busy="true">
      <div className="skeleton mb-5 h-4 w-72" />
      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        <div className="skeleton aspect-square" />
        <div className="space-y-4">
          <div className="skeleton h-4 w-24" />
          <div className="skeleton h-9 w-3/4" />
          <div className="skeleton h-5 w-40" />
          <div className="skeleton h-10 w-48" />
          <div className="skeleton h-24 w-full" />
          <div className="skeleton h-12 w-full" />
        </div>
      </div>
    </div>
  );
}