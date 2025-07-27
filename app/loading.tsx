export default function Loading() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="space-y-4">
        {/* Header skeleton */}
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>

        {/* Search skeleton */}
        <div className="flex justify-center">
          <div className="h-10 bg-gray-200 rounded w-full max-w-sm animate-pulse"></div>
        </div>

        <div className="h-px bg-gray-200 my-8"></div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar skeleton */}
          <aside className="lg:col-span-1 space-y-6">
            <div className="animate-pulse space-y-3">
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              <div className="flex gap-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-8 bg-gray-200 rounded w-20"></div>
                ))}
              </div>
            </div>
          </aside>

          {/* Main content skeleton */}
          <div className="lg:col-span-3 space-y-6">
            <div className="flex justify-between">
              <div className="h-4 bg-gray-200 rounded w-32 animate-pulse"></div>
              <div className="flex gap-2">
                <div className="h-8 bg-gray-200 rounded w-20 animate-pulse"></div>
                <div className="h-8 bg-gray-200 rounded w-20 animate-pulse"></div>
              </div>
            </div>

            {/* Article cards skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="border rounded-lg p-4 animate-pulse">
                  <div className="h-5 bg-gray-200 rounded mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
                  <div className="h-20 bg-gray-200 rounded mb-4"></div>
                  <div className="flex gap-2">
                    <div className="h-6 bg-gray-200 rounded w-16"></div>
                    <div className="h-6 bg-gray-200 rounded w-16"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}