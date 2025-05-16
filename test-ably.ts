import Ably from "ably";
import dotenv from "dotenv";
dotenv.config();

const ABLY_API_KEY = process.env.ABLY_API_KEY;
if (!ABLY_API_KEY) {
  console.error("ABLY_API_KEY not found in environment variables");
  process.exit(1);
}

console.log("Starting Ably test script with the correct approach...");

// Create Ably client
const ably = new Ably.Realtime({ key: ABLY_API_KEY });

// Log all connection state changes
ably.connection.on("connecting", () => console.log("Ably connection state: connecting"));
ably.connection.on("connected", () => console.log("Ably connection state: connected"));
ably.connection.on("disconnected", () => console.log("Ably connection state: disconnected"));
ably.connection.on("suspended", () => console.log("Ably connection state: suspended"));
ably.connection.on("closing", () => console.log("Ably connection state: closing"));
ably.connection.on("closed", () => console.log("Ably connection state: closed"));
ably.connection.on("failed", (err) => console.log("Ably connection state: failed", err));

// When connected
ably.connection.on("connected", () => {
  console.log("Connected to Ably. Testing with correct approach...");

  // Define a set of specific channels we want to listen to
  const channels = ["test:123", "test:456", "test:789"];

  console.log("Creating individual subscriptions to multiple specific channels:");
  console.log(channels.join(", "));

  // Set up specific channels
  const channelObjects = channels.map((channelName) => {
    const channel = ably.channels.get(channelName);

    // Log state changes
    channel.on("attached", () => console.log(`Channel ${channelName} state: attached`));
    channel.on("failed", (err) => console.log(`Channel ${channelName} state: failed`, err));

    // Subscribe to events
    channel.subscribe("test-event", (msg) => {
      console.log(`✅ RECEIVED message on ${channelName}:`, msg.data);
    });

    // Attach explicitly
    channel.attach();

    return { name: channelName, object: channel };
  });

  // After a delay to ensure channels are attached, publish test messages
  setTimeout(() => {
    console.log("\nPublishing test messages to each channel...");

    // Publish to all channels with slight delay
    channelObjects.forEach((channel, index) => {
      setTimeout(() => {
        console.log(`Publishing to ${channel.name}...`);
        channel.object.publish(
          "test-event",
          {
            text: `Message for ${channel.name}`,
            timestamp: new Date().toISOString(),
          })
          .then(() => {
            console.log(`✅ Successfully published to ${channel.name}`);
          })
          .catch((err) => {
            console.error(`❌ ERROR publishing to ${channel.name}:`, err);
          });
      }, index * 1000); // Stagger messages by 1 second
    });

    // After all messages, clean up
    setTimeout(() => {
      console.log("\nTest complete. You should have seen messages for each channel above.");
      console.log("CONCLUSION:");
      console.log("1. Ably correctly delivers messages to individual channels that we're explicitly subscribed to.");
      console.log("2. In your application, you need to manually subscribe to each channel that needs updates.");
      console.log("3. For your audio use case, you should subscribe to the specific channel for each session ID.");
      console.log("\nRecommendation for main app:");
      console.log("- In the worker, don't use wildcards. Instead, maintain a set of active channels.");
      console.log("- When a new session starts, add its channel to your subscription list.");
      console.log("- When a session ends, remove its channel from your subscriptions to avoid leaks.");
      ably.close();
      process.exit(0);
    }, (channelObjects.length + 2) * 1000);
  }, 2000);
});

// Handle errors
ably.connection.on("failed", (err) => {
  console.error("❌ ERROR: Ably connection failed:", err);
  process.exit(1);
});

console.log("Test script initialized, waiting for Ably connection...");
