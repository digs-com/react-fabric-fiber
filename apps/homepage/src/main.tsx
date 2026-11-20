import { createRoot } from "react-dom/client"

import { App } from "./app/App"

import "./theme/tailwind.css"
import "./theme/palettes.css"
import "./theme/global.css"

const container = document.getElementById("root")
if (!container) throw new Error("Missing #root container")

createRoot(container).render(<App />)
