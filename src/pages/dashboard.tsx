function Dashboard() {
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-content2 rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-2">Total Portfolios</h3>
          <p className="text-2xl font-bold">2</p>
        </div>
        <div className="bg-content2 rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-2">Total Files</h3>
          <p className="text-2xl font-bold">0</p>
        </div>
        <div className="bg-content2 rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-2">Last Updated</h3>
          <p className="text-sm">No data available</p>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
