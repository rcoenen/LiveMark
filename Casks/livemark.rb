cask "livemark" do
  version "1.6.4"
  sha256 "56fff9a085f80e11be015f3c84808d41c38189a861606054e65636328ae0bfe2"

  url "https://github.com/rcoenen/LiveMark/releases/download/#{version}-MAC/LiveMark-#{version}-mac-arm64.dmg"
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
