function FileExplorer() {
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4">File Explorer</h1>
      <div className="space-y-4">
        <div className="bg-content2 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Files</h2>
            <button className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90">
              Upload Files
            </button>
          </div>
          <div className="border border-divider rounded-lg p-8 text-center">
            <p className="text-default-500 mb-2">No files uploaded yet</p>
            <p className="text-sm text-default-400">Drop files here or click Upload Files to get started</p>
          </div>
        </div>
        
        <div className="bg-content2 rounded-lg p-4">
          <h2 className="text-xl font-semibold mb-3">Recent Activity</h2>
          <p className="text-default-500">No recent activity</p>
        </div>
      </div>
    </div>
  );
}

export default FileExplorer;