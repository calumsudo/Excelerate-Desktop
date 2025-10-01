import { Button } from "@heroui/react";
import { useToast } from "@/contexts/toast-context";

function Dashboard() {
  const { showToast } = useToast();

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
      
      <div className="mt-8 space-y-2">
        <h2 className="text-xl font-semibold mb-4">Toast Examples</h2>
        <div className="flex flex-wrap gap-2">
          <Button 
            color="success"
            onPress={() => showToast({ 
              title: "Success!", 
              description: "Your operation completed successfully.",
              type: "success" 
            })}
          >
            Show Success
          </Button>
          <Button 
            color="danger"
            onPress={() => showToast({ 
              title: "Error", 
              description: "Something went wrong. Please try again.",
              type: "error" 
            })}
          >
            Show Error
          </Button>
          <Button 
            color="warning"
            onPress={() => showToast({ 
              title: "Warning", 
              description: "Please check your input.",
              type: "warning" 
            })}
          >
            Show Warning
          </Button>
          <Button 
            color="primary"
            onPress={() => showToast({ 
              title: "Information", 
              description: "This is an informational message.",
              type: "info" 
            })}
          >
            Show Info
          </Button>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
