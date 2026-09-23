cask "livemark" do
  version "1.4.2"
  sha256 "0be32955d16261ddbbae5b0865e02aeb0c9b3906843c9b2d6dd27a53c2ed942a"

  url "https://github.com/rcoenen/LiveMark/releases/download/v#{version}/LiveMark-#{version}-arm64.dmg"
  name "LiveMark"
  desc "Live-updating Markdown viewer"
  homepage "https://github.com/rcoenen/LiveMark"

  livecheck do
    url :url
    strategy :github_latest
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
