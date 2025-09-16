function AlderPortfolio() {
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4">Alder Portfolio</h1>
      <div className="space-y-4">
        <div className="bg-content2 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-3">Portfolio Overview</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-default-500">Total Value</p>
              <p className="text-lg font-semibold">$0.00</p>
            </div>
            <div>
              <p className="text-sm text-default-500">Holdings</p>
              <p className="text-lg font-semibold">0</p>
            </div>
            <div>
              <p className="text-sm text-default-500">Performance</p>
              <p className="text-lg font-semibold">0%</p>
            </div>
            <div>
              <p className="text-sm text-default-500">Last Updated</p>
              <p className="text-lg font-semibold">-</p>
            </div>
          </div>
        </div>
        
        <div className="bg-content2 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-3">Recent Transactions</h2>
          <p className="text-default-500">No transactions available</p>
        </div>
      </div>
    </div>
  );
}

export default AlderPortfolio;