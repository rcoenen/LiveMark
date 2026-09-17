cask "livemark" do
  version "1.4.1"
  sha256 "3deb3623712173e5b40db491caca44f2c5d49035700e04de047600a0f010b5bb"

  url "https://github.com/rcoenen/LiveMark/releases/download/v#{version}/LiveMark-#{version}-arm64.dmg"
  name "LiveMark"
  desc "Live-updating Markdown viewer"
  homepage "https://github.com/rcoenen/LiveMark"

  livecheck do
    url :url
    strategy :github_latest
  end

  depends_on macos: :big_sur
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
