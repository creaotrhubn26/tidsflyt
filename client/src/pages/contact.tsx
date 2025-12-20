import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Phone, MapPin, ArrowLeft, Send } from "lucide-react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface PageContent {
  title: string;
  subtitle: string;
  content: string;
  email: string;
  phone: string;
  address: string;
}

export default function Contact() {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    company: "",
    orgNumber: "",
    website: "",
    phone: "",
    subject: "",
    message: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: pageContent } = useQuery<PageContent>({
    queryKey: ['/api/cms/pages/contact'],
  });

  const content = pageContent || {
    title: "Kontakt oss",
    subtitle: "Har du spørsmål? Vi hjelper deg gjerne.",
    content: "Fyll ut skjemaet nedenfor, så tar vi kontakt med deg så snart som mulig.",
    email: "kontakt@tidsflyt.no",
    phone: "+47 97 95 92 94",
    address: "Oslo, Norge"
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      
      const result = await response.json();
      
      if (response.ok) {
        toast({
          title: "Melding sendt",
          description: "Vi har mottatt din melding og vil svare så snart som mulig."
        });
        setFormData({ name: "", email: "", company: "", orgNumber: "", website: "", phone: "", subject: "", message: "" });
      } else {
        toast({
          title: "Feil",
          description: result.error || "Kunne ikke sende melding. Prøv igjen.",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Feil",
        description: "Kunne ikke sende melding. Prøv igjen senere.",
        variant: "destructive"
      });
    }
    
    setIsSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="sm" data-testid="button-back">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Tilbake
            </Button>
          </Link>
          <h1 className="text-xl font-bold" data-testid="text-page-title">Tidsflyt</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4" data-testid="text-contact-title">{content.title}</h1>
          <p className="text-lg text-muted-foreground" data-testid="text-contact-subtitle">{content.subtitle}</p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          <Card data-testid="card-contact-info">
            <CardHeader>
              <CardTitle>Kontaktinformasjon</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-lg bg-primary/10">
                  <Phone className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Telefon</p>
                  <a href={`tel:${content.phone}`} className="text-muted-foreground hover:text-primary" data-testid="link-phone">
                    {content.phone}
                  </a>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="p-3 rounded-lg bg-primary/10">
                  <MapPin className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Adresse</p>
                  <p className="text-muted-foreground" data-testid="text-address">{content.address}</p>
                </div>
              </div>

              <p className="text-sm text-muted-foreground pt-4 border-t" data-testid="text-contact-content">
                {content.content}
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-contact-form">
            <CardHeader>
              <CardTitle>Send oss en melding</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Kontaktperson *</Label>
                    <Input
                      id="name"
                      placeholder="Ditt navn"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                      data-testid="input-contact-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">E-post *</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="din@bedrift.no"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      required
                      data-testid="input-contact-email"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="company">Bedriftsnavn</Label>
                    <Input
                      id="company"
                      placeholder="Bedriftens navn"
                      value={formData.company}
                      onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                      data-testid="input-contact-company"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="orgNumber">Org.nummer</Label>
                    <Input
                      id="orgNumber"
                      placeholder="123 456 789"
                      value={formData.orgNumber}
                      onChange={(e) => setFormData({ ...formData, orgNumber: e.target.value })}
                      data-testid="input-contact-orgnumber"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="website">Nettside</Label>
                    <Input
                      id="website"
                      type="url"
                      placeholder="https://www.bedrift.no"
                      value={formData.website}
                      onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                      data-testid="input-contact-website"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Telefon</Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="+47 XXX XX XXX"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      data-testid="input-contact-phone"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="subject">Emne *</Label>
                  <Input
                    id="subject"
                    placeholder="Hva gjelder henvendelsen?"
                    value={formData.subject}
                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                    required
                    data-testid="input-contact-subject"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="message">Melding *</Label>
                  <Textarea
                    id="message"
                    placeholder="Beskriv hva du ønsker å vite mer om..."
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    rows={5}
                    required
                    data-testid="textarea-contact-message"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isSubmitting} data-testid="button-submit-contact">
                  {isSubmitting ? "Sender..." : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Send henvendelse
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>

      <footer className="border-t py-8 mt-12">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <div className="flex justify-center gap-6 mb-4">
            <Link href="/personvern" className="hover:text-foreground" data-testid="link-privacy">Personvern</Link>
            <Link href="/vilkar" className="hover:text-foreground" data-testid="link-terms">Vilkår</Link>
          </div>
          <p data-testid="text-copyright">© 2025 Tidsflyt. Alle rettigheter reservert.</p>
        </div>
      </footer>
    </div>
  );
}
