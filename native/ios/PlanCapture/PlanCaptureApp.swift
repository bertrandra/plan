// Point d'entree de Plan Capture : une seule vue, celle de CaptureViewController.

import SwiftUI

@main
struct PlanCaptureApp: App {
    var body: some Scene {
        WindowGroup {
            VueCapture().ignoresSafeArea()
        }
    }
}

struct VueCapture: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> CaptureViewController { CaptureViewController() }
    func updateUIViewController(_ controleur: CaptureViewController, context: Context) {}
}
