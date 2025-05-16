import React from "react";
import WelcomeScreen from "../components/WelcomeScreen"; // Adjust path if needed
import { useRouter } from "next/router";

const WelcomePage = () => {
  const router = useRouter();

  const handleUserArrived = () => {
    console.log("User arrived! Navigating away from welcome screen...");
    // Navigate to the home page or another appropriate page
    router.push("/"); // Navigate to the root/home page by default
  };

  return <WelcomeScreen handleUserArrived={handleUserArrived} />;
};

export default WelcomePage;
