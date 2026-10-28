// Ventana nativa de choisys para Windows: solo carga la build web exportada de apps/mobile.
// No contiene lógica del producto ni del Cubo.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("choisys no pudo arrancar");
}
