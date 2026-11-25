import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { DialogProvider, Empty } from "./components/ui";
import { Dashboard } from "./pages/Dashboard";
import { Library } from "./pages/Library";
import { DocumentView } from "./pages/DocumentView";
import { Generate } from "./pages/Generate";
import { Quizzes } from "./pages/Quizzes";
import { QuizDetail } from "./pages/QuizDetail";
import { Exam } from "./pages/Exam";
import { Results } from "./pages/Results";
import { History } from "./pages/History";
import { Settings } from "./pages/Settings";
import { Compass } from "lucide-react";

export function App() {
  return (
    <BrowserRouter>
      <DialogProvider>
        <Routes>
          <Route path="/examen/:id" element={<Exam />} />
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="bibliotheque" element={<Library />} />
            <Route path="bibliotheque/document/:id" element={<DocumentView />} />
            <Route path="generer" element={<Generate />} />
            <Route path="qcm" element={<Quizzes />} />
            <Route path="qcm/:id" element={<QuizDetail />} />
            <Route path="resultats/:id" element={<Results />} />
            <Route path="historique" element={<History />} />
            <Route path="parametres" element={<Settings />} />
            <Route path="*" element={<div className="page"><Empty icon={<Compass />} title="Page introuvable" action={<Link className="btn" to="/">Retour à l'accueil</Link>} /></div>} />
          </Route>
        </Routes>
      </DialogProvider>
    </BrowserRouter>
  );
}
