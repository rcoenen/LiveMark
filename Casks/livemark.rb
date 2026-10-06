cask "livemark" do
  version "1.6.5"
  sha256 "421a07e4120d44f4f10c1db34dae54438b786305e1f338ba5318eb55fb69fea9"

  url "https://github.com/rcoenen/LiveMark/releases/download/1.6.5-MAC/LiveMark-1.6.5-mac-arm64.dmg"
  name "LiveMark"
  desc "Live-updating Markdown viewer"
  homepage "https://github.com/rcoenen/LiveMark"

  livecheck do
  url :url
  regex(/^v?(\d+(?:\.\d+)+)-MAC$/i)
  strategy :github_releases
end

  depends_on arch: :arm64
  depends_on :macos

  app "LiveMark.app"
  binary "#{appdir}/LiveMark.app/Contents/Resources/bin/livemark"

  # Ad-hoc signed, not notarized. Strip quarantine so Gatekeeper does not block launch.
  postflight_steps do
    run "/usr/bin/xattr", args:           ["-cr", "{{appdir}}/LiveMark.app"],
                          writable_paths: ["{{appdir}}/LiveMark.app"]
  end

  zap trash: [
    "~/Library/Application Support/LiveMark",
    "~/Library/Preferences/com.livemark.app.plist",
  ]
end
