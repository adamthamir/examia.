import { Cpu, Database, FileText, KeyRound, LogOut, ShieldCheck } from "lucide-react";
import { api } from "../api";
import { useAsync } from "../hooks";
import { Loading, PageHeader } from "../components/ui";

export function Settings() {
  const { data: ai } = useAsync(() => api.aiStatus(), []);
  const { data: auth } = useAsync(() => api.authStatus(), []);
  return (
    <div className="page narrow">
      <PageHeader title="Paramètres" subtitle="Intelligence artificielle, données et formats pris en charge." />
      <div className="stack gap-16">
        <div className="card">
          <div className="card-head"><h2 className="row gap-8"><Cpu size={16} /> Intelligence artificielle</h2></div>
          <div className="card-body stack gap-12">
            {!ai ? <Loading /> : (
              <>
                <div className="row gap-12">
                  <span className={`dot ${ai.configured ? "on" : "demo"}`} />
                  <div className="flex-1">
                    <div style={{ fontWeight: 600 }}>{ai.configured ? "Claude (Anthropic) connecté" : "Mode démonstration"}</div>
                    <div className="small muted">{ai.configured ? `Modèle : ${ai.model}` : "Aucune clé d'API n'est configurée sur le serveur."}</div>
                  </div>
                  <span className={`badge ${ai.configured ? "badge-good" : "badge-warn"}`}>{ai.configured ? "Actif" : "Sans IA"}</span>
                </div>
                <div className="callout">
                  <div className="callout-title"><KeyRound /> Configuration sécurisée de la clé</div>
                  La clé d'API est lue uniquement par le serveur, depuis le fichier <code>.env</code> (variable <code>ANTHROPIC_API_KEY</code>). Elle n'est jamais envoyée au navigateur ni affichée dans l'interface. Redémarrez le serveur après modification.
                </div>
              </>
            )}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h2 className="row gap-8"><FileText size={16} /> Formats pris en charge</h2></div>
          <div className="card-body small muted stack gap-8">
            <div><b style={{ color: "var(--text)" }}>PDF</b> — texte extrait page par page ; les PDF scannés sont transcrits par l'IA lorsqu'elle est connectée.</div>
            <div><b style={{ color: "var(--text)" }}>PowerPoint (PPTX)</b> — texte de chaque diapositive et notes de l'orateur.</div>
            <div><b style={{ color: "var(--text)" }}>Word (DOCX)</b> — découpage par titres pour des références précises.</div>
            <div><b style={{ color: "var(--text)" }}>Images (PNG, JPG, WEBP)</b> — transcription par l'IA, ou OCR local (Tesseract) en mode démo.</div>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h2 className="row gap-8"><Database size={16} /> Données</h2></div>
          <div className="card-body small muted">Vos cours, QCM et résultats sont enregistrés sur le serveur EXAMIA (base SQLite et dossier de fichiers). Seuls les extraits de cours nécessaires à la génération sont transmis au fournisseur d'IA.</div>
        </div>
        {auth?.required && (
          <div className="card card-pad row gap-12 wrap between">
            <div>
              <div style={{ fontWeight: 600 }}>Session</div>
              <div className="small muted">Accès protégé par code. Déconnectez-vous sur un appareil partagé.</div>
            </div>
            <button className="btn" onClick={async () => { await api.logout(); window.location.href = "/"; }}><LogOut /> Se déconnecter</button>
          </div>
        )}
        <div className="callout primary">
          <div className="callout-title"><ShieldCheck /> À propos des questions</div>
          EXAMIA crée des questions d'entraînement inspirées du format des examens des facultés de sciences de la santé. Il ne reproduit pas de sujets officiels. Vérifiez toujours les corrections signalées « hors cours ».
        </div>
      </div>
    </div>
  );
}
