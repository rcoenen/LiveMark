cask "livemark" do
  version "1.3.1"
  sha256 "94376307478cb489c4d0de89e5d8c5979f991d0e504a994a2b15374ede628c97"

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
