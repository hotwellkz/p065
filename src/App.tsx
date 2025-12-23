import { BrowserRouter } from "react-router-dom";
import AppRouter from "./router";
import { AIAssistantProvider } from "./components/aiAssistant/AIAssistantProvider";
import { AIAssistantPanel } from "./components/aiAssistant/AIAssistantPanel";
import { AIAssistantFloatingButton } from "./components/aiAssistant/AIAssistantFloatingButton";

const App = () => {
  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true
      }}
    >
      <AIAssistantProvider>
        <AppRouter />
        <AIAssistantPanel />
        <AIAssistantFloatingButton />
      </AIAssistantProvider>
    </BrowserRouter>
  );
};

export default App;
