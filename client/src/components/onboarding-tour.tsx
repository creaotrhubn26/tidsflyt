import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { X, ChevronRight, ChevronLeft } from 'lucide-react';
import { useLocalStorage } from '@/hooks/use-local-storage';

interface TourStep {
  title: string;
  description: string;
  target?: string;
  action?: string;
}

const tourSteps: TourStep[] = [
  {
    title: 'Velkommen til Tidsflyt! 👋',
    description: 'La oss ta en rask omvisning for å komme i gang. Dette tar bare 30 sekunder.',
  },
  {
    title: 'Stemple inn og ut ⏰',
    description: 'Bruk knappene "Stemple INN" og "Stemple UT" for å registrere arbeidstid. Du kan også bruke hurtigmaler for vanlige aktiviteter.',
    target: '#quick-stamp-section',
  },
  {
    title: 'Timelogg 📋',
    description: 'Se alle dine registreringer i tabellen. Du kan redigere, slette og filtrere etter dato.',
    target: '#time-log-table',
  },
  {
    title: 'Månedlig rapport 📊',
    description: 'Generer profesjonelle rapporter i Google Docs med ett klikk. Perfekt for timeføring til oppdragsgiver.',
    target: '#report-button',
  },
  {
    title: 'Du er klar! ✅',
    description: 'Det var det! Begynn å registrere tid nå, eller utforsk innstillingene for å tilpasse systemet.',
    action: 'Kom i gang',
  },
];

export function OnboardingTour() {
  const [hasCompletedTour, setHasCompletedTour] = useLocalStorage('onboarding-completed', false);
  const [currentStep, setCurrentStep] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!hasCompletedTour) {
      const timer = setTimeout(() => {
        setIsOpen(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [hasCompletedTour]);

  useEffect(() => {
    if (isOpen && tourSteps[currentStep].target) {
      const target = document.querySelector(tourSteps[currentStep].target!);
      if (target) {
        const rect = target.getBoundingClientRect();
        setPosition({
          top: rect.bottom + window.scrollY + 10,
          left: rect.left + window.scrollX,
        });
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } else {
      setPosition(null);
    }
  }, [currentStep, isOpen]);

  const handleNext = () => {
    if (currentStep < tourSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = () => {
    setHasCompletedTour(true);
    setIsOpen(false);
  };

  const handleSkip = () => {
    setHasCompletedTour(true);
    setIsOpen(false);
  };

  if (!isOpen) return null;

  const step = tourSteps[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === tourSteps.length - 1;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-50" onClick={handleSkip} />
      
      {/* Tour Card */}
      <Card 
        className="fixed z-50 w-96 shadow-lg"
        style={
          position
            ? { top: `${position.top}px`, left: `${position.left}px` }
            : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
        }
      >
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>{step.title}</CardTitle>
              <CardDescription className="mt-2">{step.description}</CardDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSkip}
              aria-label="Lukk omvisning"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardFooter className="flex items-center justify-between">
          <div className="flex gap-1">
            {tourSteps.map((_, index) => (
              <div
                key={index}
                className={`h-2 w-2 rounded-full ${
                  index === currentStep ? 'bg-primary' : 'bg-muted'
                }`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            {!isFirstStep && (
              <Button variant="outline" size="sm" onClick={handlePrev}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Tilbake
              </Button>
            )}
            <Button size="sm" onClick={handleNext}>
              {isLastStep ? (step.action || 'Fullfør') : 'Neste'}
              {!isLastStep && <ChevronRight className="h-4 w-4 ml-1" />}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </>
  );
}
