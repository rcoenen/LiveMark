cask "livemark" do
  version "1.3.0"
  sha256 "78917a350e8e6c493cafc52d62f7ab503b3f7e2a503d8edefc655610d698ba16"

  url "https://github.com/rcoenen/LiveMark/releases/download/v#{version}/LiveMark-#{version}-arm64.dmg"
  name "LiveMark"
  desc "Live-updating Markdown viewer"
  homepage "https://github.com/rcoenen/LiveMark"

  livecheck do
    url :url
    strategy :github_latest
  end

  depends_on macos: :catalina
  depends_on arch: :arm64

  app "LiveMark.app"
  binary "#{appdir}/LiveMark.app/Contents/Resources/bin/livemark"

  # Ad-hoc signed, not notarized. Strip quarantine so Gatekeeper does not block launch.
  postflight do
    system_command "/usr/bin/xattr", args: ["-cr", "#{appdir}/LiveMark.app"]
  end

  zap trash: [
    "~/Library/Application Support/LiveMark",
    "~/Library/Preferences/com.livemark.app.plist",
  ]
end
