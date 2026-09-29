// Plan Capture — le module natif du releve de facade (MD/spec-releve-facade.md §5.1).
//
// Safari ne donne pas acces au LiDAR. Cette application affiche Plan dans une vue web transparente,
// posee sur une vue ARKit : pendant la visee, la camera AR est visible a travers la page, et la
// profondeur mesuree au centre de l'image est envoyee a la page dix fois par seconde. La photo est
// prise ici aussi, avec la focale exacte de l'objectif (intrinseques ARKit), et livree a la page.
//
// Le contrat avec la page tient en trois messages et deux evenements :
//
//   page -> natif  window.webkit.messageHandlers.planCapture.postMessage({ action })
//                  action = "demarrer" | "arreter" | "photo"
//   natif -> page  window.dispatchEvent(new CustomEvent("plan:profondeur", { detail: { distance, confiance } }))
//                  window.dispatchEvent(new CustomEvent("plan:photo", { detail: { dataUrl, focalePx } }))
//
// Cote page : src/ui/releve/profondeur.ts. Rien d'autre de Plan ne sait que ce module existe.

import ARKit
import UIKit
import WebKit

final class CaptureViewController: UIViewController, ARSessionDelegate, WKScriptMessageHandler, WKNavigationDelegate {
    private let vueAR = ARSCNView()
    private var vueWeb: WKWebView!
    private let contexteImage = CIContext()
    private var derniereMesure = Date.distantPast
    private var mesureActive = false

    /// Ou trouver Plan : la cle `PlanURL` d'Info.plist, sinon le site de production.
    private var adressePlan: URL {
        let texte = Bundle.main.object(forInfoDictionaryKey: "PlanURL") as? String
        return URL(string: texte ?? "https://plan.raillard.org/")!
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        vueAR.frame = view.bounds
        vueAR.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        vueAR.session.delegate = self
        vueAR.automaticallyUpdatesLighting = false
        view.addSubview(vueAR)

        let configuration = WKWebViewConfiguration()
        configuration.userContentController.add(self, name: "planCapture")
        configuration.allowsInlineMediaPlayback = true
        vueWeb = WKWebView(frame: view.bounds, configuration: configuration)
        vueWeb.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        // Transparente : pendant la visee, la page s'efface (html.releveNatif) et laisse voir l'AR.
        vueWeb.isOpaque = false
        vueWeb.backgroundColor = .clear
        vueWeb.scrollView.backgroundColor = .clear
        vueWeb.scrollView.contentInsetAdjustmentBehavior = .never
        vueWeb.navigationDelegate = self
        view.addSubview(vueWeb)
        vueWeb.load(URLRequest(url: adressePlan))
    }

    // MARK: - Messages de la page

    func userContentController(_ controleur: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let corps = message.body as? [String: Any], let action = corps["action"] as? String else { return }
        switch action {
        case "demarrer": demarrer()
        case "arreter": arreter()
        case "photo": prendrePhoto()
        default: break
        }
    }

    private func demarrer() {
        guard ARWorldTrackingConfiguration.isSupported else { return }
        let configuration = ARWorldTrackingConfiguration()
        // La profondeur LiDAR n'existe que sur les appareils qui en ont un ; sans lui, la page garde
        // l'estimation par le cadrage, et la photo reste prise ici avec sa focale exacte.
        if ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth) {
            configuration.frameSemantics.insert(.sceneDepth)
        }
        vueAR.session.run(configuration, options: [.resetTracking, .removeExistingAnchors])
        mesureActive = true
    }

    private func arreter() {
        mesureActive = false
        vueAR.session.pause()
    }

    // MARK: - Profondeur

    func session(_ session: ARSession, didUpdate frame: ARFrame) {
        guard mesureActive, Date().timeIntervalSince(derniereMesure) >= 0.1 else { return }
        derniereMesure = Date()
        guard let profondeur = frame.sceneDepth else { return }
        guard let (distance, confiance) = profondeurAuCentre(profondeur) else { return }
        envoyer("plan:profondeur", ["distance": distance, "confiance": confiance])
    }

    /// Mediane d'une fenetre de 7 x 7 au centre de la carte de profondeur, et la confiance la plus basse.
    private func profondeurAuCentre(_ p: ARDepthData) -> (Double, Int)? {
        let carte = p.depthMap
        CVPixelBufferLockBaseAddress(carte, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(carte, .readOnly) }
        let l = CVPixelBufferGetWidth(carte), h = CVPixelBufferGetHeight(carte)
        let pas = CVPixelBufferGetBytesPerRow(carte) / MemoryLayout<Float32>.size
        guard let base = CVPixelBufferGetBaseAddress(carte)?.assumingMemoryBound(to: Float32.self) else { return nil }
        var valeurs: [Float32] = []
        for y in (h / 2 - 3)...(h / 2 + 3) {
            for x in (l / 2 - 3)...(l / 2 + 3) {
                let v = base[y * pas + x]
                if v.isFinite && v > 0 { valeurs.append(v) }
            }
        }
        guard !valeurs.isEmpty else { return nil }
        valeurs.sort()
        var confiance = 2
        if let carteConfiance = p.confidenceMap {
            CVPixelBufferLockBaseAddress(carteConfiance, .readOnly)
            defer { CVPixelBufferUnlockBaseAddress(carteConfiance, .readOnly) }
            let pasC = CVPixelBufferGetBytesPerRow(carteConfiance)
            if let b = CVPixelBufferGetBaseAddress(carteConfiance)?.assumingMemoryBound(to: UInt8.self) {
                confiance = Int(b[(h / 2) * pasC + l / 2])
            }
        }
        return (Double(valeurs[valeurs.count / 2]), confiance)
    }

    // MARK: - Photo

    /// Plus grand cote de la photo livree : ce que la page traite (src/ui/releve/camera.ts).
    private let photoMaxPx: CGFloat = 2400

    private func prendrePhoto() {
        guard let frame = vueAR.session.currentFrame else { return }
        // L'image du capteur est en paysage ; le telephone est tenu en portrait pendant la visee.
        let brute = CIImage(cvPixelBuffer: frame.capturedImage).oriented(.right)
        let k = min(1, photoMaxPx / max(brute.extent.width, brute.extent.height))
        let image = brute.transformed(by: CGAffineTransform(scaleX: k, y: k))
        guard let espace = CGColorSpace(name: CGColorSpace.sRGB),
              let jpeg = contexteImage.jpegRepresentation(of: image, colorSpace: espace, options: [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: 0.85])
        else { return }
        // La focale en pixels ne depend pas de l'orientation (pixels carres) ; elle suit la reduction.
        let focale = Double(frame.camera.intrinsics[0][0]) * Double(k)
        envoyer("plan:photo", ["dataUrl": "data:image/jpeg;base64," + jpeg.base64EncodedString(), "focalePx": focale])
    }

    // MARK: - Vers la page

    private func envoyer(_ evenement: String, _ detail: [String: Any]) {
        guard let donnees = try? JSONSerialization.data(withJSONObject: detail),
              let json = String(data: donnees, encoding: .utf8) else { return }
        let script = "window.dispatchEvent(new CustomEvent('\(evenement)', { detail: \(json) }));"
        DispatchQueue.main.async { self.vueWeb.evaluateJavaScript(script, completionHandler: nil) }
    }
}
